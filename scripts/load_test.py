#!/usr/bin/env python3
"""VAYZEN production smoke/load tester.

Examples:
  python scripts/load_test.py --health https://vayzen-gateway-production.up.railway.app/health
  python scripts/load_test.py --url "SIGNED_STREAM_URL" --concurrency 8 --requests 40 --range-kb 512

The stream test requests small byte ranges only; it does not download whole movies.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import statistics
import sys
import time
import urllib.error
import urllib.request


def request_once(url: str, range_bytes: int, timeout: float):
    start = time.perf_counter()
    headers = {
        "User-Agent": "VAYZEN-Release-Load-Test/1.0",
        "Range": f"bytes=0-{max(0, range_bytes - 1)}",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    status = 0
    size = 0
    error = ""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            status = int(res.status)
            data = res.read(range_bytes + 1)
            size = len(data)
    except urllib.error.HTTPError as exc:
        status = int(exc.code)
        error = str(exc.reason)
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    elapsed = time.perf_counter() - start
    ok = status in (200, 206) and size > 0
    return {"ok": ok, "status": status, "bytes": size, "seconds": elapsed, "error": error}


def discover_stream_api(api_url: str, timeout: float):
    sep = "&" if "?" in api_url else "?"
    catalog_url = api_url + sep + "action=catalog"
    req = urllib.request.Request(catalog_url, headers={"User-Agent": "VAYZEN-Release-Load-Test/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = json.loads(res.read().decode("utf-8"))
    movies = data.get("movies") or []
    if movies:
        movie_id = movies[0].get("id")
        if movie_id:
            return api_url + sep + "media=movie_video&id=" + str(movie_id)

    series = data.get("series") or []
    for item in series[:5]:
        series_id = item.get("id")
        if not series_id:
            continue
        content_url = api_url + sep + "action=series_content&id=" + str(series_id)
        req = urllib.request.Request(content_url, headers={"User-Agent": "VAYZEN-Release-Load-Test/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as res:
            content = json.loads(res.read().decode("utf-8"))
        for season in content.get("seasons") or []:
            eps = season.get("episodes") or []
            if eps and eps[0].get("id"):
                return api_url + sep + "media=episode_video&id=" + str(eps[0]["id"])
    raise RuntimeError("No published playable media found through catalog API")


def health_check(url: str, timeout: float):
    started = time.perf_counter()
    req = urllib.request.Request(url, headers={"User-Agent": "VAYZEN-Release-Load-Test/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = res.read()
        data = json.loads(body.decode("utf-8"))
    elapsed = time.perf_counter() - started
    print(json.dumps({"health": data, "seconds": round(elapsed, 3)}, ensure_ascii=False, indent=2))
    return bool(data.get("ok"))


def percentile(values, pct):
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round((pct / 100) * (len(ordered) - 1)))))
    return ordered[idx]


def main():
    p = argparse.ArgumentParser(description="VAYZEN gateway smoke/load tester")
    p.add_argument("--url", help="Signed /stream URL for Range testing")
    p.add_argument("--health", help="Gateway /health URL")
    p.add_argument("--api", help="VAYZEN public API URL; auto-discovers a playable movie/episode")
    p.add_argument("--concurrency", type=int, default=6)
    p.add_argument("--requests", type=int, default=24)
    p.add_argument("--range-kb", type=int, default=512)
    p.add_argument("--timeout", type=float, default=20.0)
    p.add_argument("--max-error-rate", type=float, default=0.05)
    p.add_argument("--max-p95", type=float, default=8.0)
    args = p.parse_args()

    if not args.url and not args.health and not args.api:
        p.error("provide --health, --url and/or --api")

    if args.health:
        try:
            if not health_check(args.health, args.timeout):
                print("HEALTH_FAIL: gateway reported ok=false", file=sys.stderr)
                return 2
        except Exception as exc:
            print(f"HEALTH_FAIL: {exc}", file=sys.stderr)
            return 2

    stream_url = args.url
    if not stream_url and args.api:
        try:
            stream_url = discover_stream_api(args.api, args.timeout)
            print(json.dumps({"discovered_stream": stream_url}, ensure_ascii=False))
        except Exception as exc:
            print(f"DISCOVERY_FAIL: {exc}", file=sys.stderr)
            return 5

    if not stream_url:
        return 0

    concurrency = min(64, max(1, args.concurrency))
    total = min(1000, max(1, args.requests))
    range_bytes = min(8 * 1024 * 1024, max(16 * 1024, args.range_kb * 1024))

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(request_once, stream_url, range_bytes, args.timeout) for _ in range(total)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    wall = time.perf_counter() - started

    success = [r for r in results if r["ok"]]
    failed = [r for r in results if not r["ok"]]
    latencies = [r["seconds"] for r in results]
    error_rate = len(failed) / len(results)
    statuses = {}
    for r in results:
        statuses[str(r["status"] or "network")] = statuses.get(str(r["status"] or "network"), 0) + 1

    summary = {
        "requests": len(results),
        "concurrency": concurrency,
        "range_kb": range_bytes // 1024,
        "success": len(success),
        "failed": len(failed),
        "error_rate": round(error_rate, 4),
        "wall_seconds": round(wall, 3),
        "requests_per_second": round(len(results) / wall, 2) if wall else 0,
        "latency_seconds": {
            "avg": round(statistics.fmean(latencies), 3) if latencies else 0,
            "p50": round(percentile(latencies, 50), 3),
            "p95": round(percentile(latencies, 95), 3),
            "max": round(max(latencies), 3) if latencies else 0,
        },
        "statuses": statuses,
        "sample_errors": [r["error"] for r in failed if r["error"]][:5],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if error_rate > args.max_error_rate:
        print("LOAD_FAIL: error rate exceeded threshold", file=sys.stderr)
        return 3
    if percentile(latencies, 95) > args.max_p95:
        print("LOAD_FAIL: p95 latency exceeded threshold", file=sys.stderr)
        return 4
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
