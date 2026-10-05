import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import time
from pathlib import Path
from urllib.parse import urlparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

STREAM_SIGNING_SECRET = os.environ.get("STREAM_SIGNING_SECRET", "").encode()
EDGE_SHARED_SECRET = os.environ.get("VAYZEN_EDGE_SHARED_SECRET", "").encode()
SESSION_ROOT = Path(os.environ.get("MEDIA_SESSION_ROOT", "/tmp/vayzen-media"))
SESSION_TTL = max(120, int(os.environ.get("MEDIA_SESSION_TTL_SECONDS", "1200")))
PROBE_TIMEOUT = max(8, int(os.environ.get("MEDIA_PROBE_TIMEOUT_SECONDS", "35")))
HLS_START_TIMEOUT = max(5, int(os.environ.get("MEDIA_HLS_START_TIMEOUT_SECONDS", "25")))
MAX_SESSIONS = max(1, min(6, int(os.environ.get("MEDIA_MAX_SESSIONS", "2"))))

app = FastAPI(title="VAYZEN Media Worker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
    allow_headers=["*"],
)

SESSION_ROOT.mkdir(parents=True, exist_ok=True)
sessions: dict[str, dict] = {}
session_lock = asyncio.Lock()
session_slots = asyncio.Semaphore(MAX_SESSIONS)


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _xtream_proxy_key() -> bytes:
    if not STREAM_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Streaming secret is not configured")
    return hashlib.sha256(b"vayzen:xtream-proxy:v1:" + STREAM_SIGNING_SECRET).digest()


def decrypt_xtream_target(token: str) -> tuple[str, int]:
    if not token.startswith("v1.") or len(token) > 8192:
        raise HTTPException(status_code=401, detail="Invalid media token")
    try:
        raw = _b64url_decode(token[3:])
        nonce, encrypted = raw[:12], raw[12:]
        payload = AESGCM(_xtream_proxy_key()).decrypt(nonce, encrypted, b"vayzen-xtream-v1")
        data = json.loads(payload.decode())
        url = str(data.get("u") or "")
        exp = int(data.get("e") or 0)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid media token") from exc
    if exp < int(time.time()) - 5:
        raise HTTPException(status_code=401, detail="Media token expired")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid upstream URL")
    return url, exp


def require_edge_secret(value: str | None):
    supplied = (value or "").encode()
    if not EDGE_SHARED_SECRET or not supplied or not hmac.compare_digest(EDGE_SHARED_SECRET, supplied):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def run_json_process(*args: str, timeout: int) -> dict:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise HTTPException(status_code=504, detail="Media inspection timed out")
    if process.returncode != 0:
        message = stderr.decode("utf-8", errors="replace").strip()[-1200:]
        raise HTTPException(status_code=502, detail=message or "Media inspection failed")
    try:
        return json.loads(stdout.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Invalid ffprobe response") from exc


async def probe_url(url: str) -> dict:
    data = await run_json_process(
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=format_name,duration:stream=index,codec_type,codec_name,channels",
        "-of", "json",
        url,
        timeout=PROBE_TIMEOUT,
    )
    streams = data.get("streams") or []
    video = next((x for x in streams if x.get("codec_type") == "video"), {})
    audio = next((x for x in streams if x.get("codec_type") == "audio"), {})
    fmt = str((data.get("format") or {}).get("format_name") or "").lower()
    vcodec = str(video.get("codec_name") or "").lower()
    acodec = str(audio.get("codec_name") or "").lower()
    channels = int(audio.get("channels") or 0)
    duration = float((data.get("format") or {}).get("duration") or 0)

    web_mp4 = any(x in fmt for x in ("mp4", "mov", "m4a", "3gp"))
    web_webm = "webm" in fmt
    if web_mp4 and vcodec in ("h264", "av1") and acodec in ("aac", "mp3"):
        mode = "direct"
    elif web_webm and vcodec in ("vp8", "vp9", "av1") and acodec in ("opus", "vorbis"):
        mode = "direct"
    elif vcodec == "h264" and acodec in ("aac", "mp3"):
        mode = "hls_remux"
    elif vcodec == "h264":
        mode = "audio_aac"
    else:
        mode = "full_h264_aac"

    return {
        "format": fmt,
        "video_codec": vcodec,
        "audio_codec": acodec,
        "audio_channels": channels or None,
        "duration_seconds": duration or None,
        "recommended_mode": mode,
    }


def safe_mode(value: str) -> str:
    return value if value in ("hls_remux", "audio_aac", "full_h264_aac") else "auto"


async def cleanup_sessions():
    now = time.time()
    async with session_lock:
        keys = list(sessions)
        for key in keys:
            row = sessions.get(key)
            if not row:
                continue
            process = row.get("process")
            idle = now - float(row.get("last_access") or now)
            finished = process is None or process.returncode is not None
            if idle < SESSION_TTL and not (finished and idle > 120):
                continue
            if process is not None and process.returncode is None:
                process.terminate()
            shutil.rmtree(row["dir"], ignore_errors=True)
            sessions.pop(key, None)


async def _wait_process(key: str, process: asyncio.subprocess.Process):
    try:
        await process.wait()
    finally:
        session_slots.release()
        row = sessions.get(key)
        if row:
            row["finished_at"] = time.time()


async def create_hls_session(token: str, requested_mode: str) -> dict:
    url, _ = decrypt_xtream_target(token)
    mode = safe_mode(requested_mode)
    if mode == "auto":
        info = await probe_url(url)
        mode = info["recommended_mode"]
        if mode == "direct":
            mode = "hls_remux"

    key = hashlib.sha256((token + "|" + mode).encode()).hexdigest()[:32]
    await cleanup_sessions()

    async with session_lock:
        current = sessions.get(key)
        if current:
            current["last_access"] = time.time()
            return current

        await session_slots.acquire()
        directory = SESSION_ROOT / key
        shutil.rmtree(directory, ignore_errors=True)
        directory.mkdir(parents=True, exist_ok=True)
        playlist = directory / "index.m3u8"
        segment_pattern = str(directory / "seg-%06d.ts")

        args = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin",
            "-rw_timeout", "15000000",
            "-i", url,
            "-map", "0:v:0", "-map", "0:a:0?",
        ]
        if mode == "hls_remux":
            args += ["-c:v", "copy", "-c:a", "copy"]
        elif mode == "audio_aac":
            args += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2"]
        else:
            args += [
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-c:a", "aac", "-b:a", "160k", "-ac", "2",
            ]
        args += [
            "-f", "hls",
            "-hls_time", "6",
            "-hls_playlist_type", "event",
            "-hls_flags", "independent_segments+append_list",
            "-hls_segment_filename", segment_pattern,
            str(playlist),
        ]

        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        row = {
            "key": key,
            "dir": directory,
            "playlist": playlist,
            "process": process,
            "mode": mode,
            "created_at": time.time(),
            "last_access": time.time(),
        }
        sessions[key] = row
        asyncio.create_task(_wait_process(key, process))

    deadline = time.time() + HLS_START_TIMEOUT
    while time.time() < deadline:
        if playlist.exists() and playlist.stat().st_size > 20:
            return row
        if process.returncode is not None:
            stderr = b""
            if process.stderr:
                stderr = await process.stderr.read()
            message = stderr.decode("utf-8", errors="replace").strip()[-1200:]
            raise HTTPException(status_code=502, detail=message or "Compatibility stream failed")
        await asyncio.sleep(0.25)
    raise HTTPException(status_code=504, detail="Compatibility stream startup timed out")


@app.get("/health")
async def health():
    active = sum(1 for x in sessions.values() if x.get("process") and x["process"].returncode is None)
    return {
        "ok": True,
        "service": "vayzen-media-worker",
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "ffprobe": bool(shutil.which("ffprobe")),
        "active_sessions": active,
        "max_sessions": MAX_SESSIONS,
    }


@app.post("/probe/{token}")
async def probe(token: str, x_vayzen_edge_secret: str | None = Header(default=None)):
    require_edge_secret(x_vayzen_edge_secret)
    url, _ = decrypt_xtream_target(token)
    info = await probe_url(url)
    return {"ok": True, **info}


@app.get("/hls/{token}/index.m3u8")
async def hls_index(token: str, mode: str = "auto"):
    row = await create_hls_session(token, mode)
    row["last_access"] = time.time()
    return FileResponse(
        row["playlist"],
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/hls/{token}/{asset}")
async def hls_asset(token: str, asset: str, mode: str = "auto"):
    if not re.fullmatch(r"seg-\d{6}\.ts", asset):
        raise HTTPException(status_code=404, detail="Segment not found")
    row = await create_hls_session(token, mode)
    row["last_access"] = time.time()
    path = row["dir"] / asset
    deadline = time.time() + 12
    while time.time() < deadline and not path.exists():
        process = row.get("process")
        if process is not None and process.returncode is not None:
            break
        await asyncio.sleep(0.2)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Segment not ready")
    return FileResponse(
        path,
        media_type="video/mp2t",
        headers={"Cache-Control": "private, max-age=3600"},
    )
