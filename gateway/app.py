import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import time
from contextlib import asynccontextmanager
from urllib.parse import urljoin, urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from telethon import TelegramClient, utils

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
EDGE_SHARED_SECRET = os.environ.get("VAYZEN_EDGE_SHARED_SECRET", "").encode()
TELEGRAM_WEBHOOK_URL = os.environ.get("TELEGRAM_WEBHOOK_URL", "").strip()
TELEGRAM_BOT_SECRET = os.environ.get("TELEGRAM_BOT_SECRET", "").strip()
STREAM_SIGNING_SECRET = os.environ.get("STREAM_SIGNING_SECRET", "").encode()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
VAYZEN_API_TARGET = os.environ.get("VAYZEN_API_TARGET", "").rstrip("/")
if not VAYZEN_API_TARGET and SUPABASE_URL:
    VAYZEN_API_TARGET = f"{SUPABASE_URL}/functions/v1/vayzen-gateway"
MAX_CONCURRENT_STREAMS = max(1, int(os.environ.get("MAX_CONCURRENT_STREAMS", "6")))
CHUNK_SIZE = max(128, int(os.environ.get("STREAM_CHUNK_KB", "512"))) * 1024
MAX_RANGE_WINDOW = max(4, int(os.environ.get("MAX_RANGE_WINDOW_MB", "32"))) * 1024 * 1024
STREAM_CHUNK_TIMEOUT = max(10, int(os.environ.get("STREAM_CHUNK_TIMEOUT_SECONDS", "35")))
STREAM_READ_RETRIES = max(1, min(6, int(os.environ.get("STREAM_READ_RETRIES", "3"))))
STREAM_QUEUE_TIMEOUT = max(1.0, float(os.environ.get("STREAM_QUEUE_TIMEOUT_SECONDS", "12")))
MAX_MEDIA_BYTES = max(1, int(os.environ.get("MAX_MEDIA_MB", "2000"))) * 1024 * 1024
MEDIA_CACHE_TTL = max(5.0, float(os.environ.get("MEDIA_CACHE_TTL_SECONDS", "60")))
MEDIA_CACHE_MAX = max(32, int(os.environ.get("MEDIA_CACHE_MAX", "256")))
XTREAM_PROXY_TTL_SECONDS = max(300, min(24 * 60 * 60, int(os.environ.get("XTREAM_PROXY_TTL_SECONDS", str(6 * 60 * 60)))))
XTREAM_PROXY_CONNECT_TIMEOUT = max(3.0, float(os.environ.get("XTREAM_PROXY_CONNECT_TIMEOUT_SECONDS", "12")))
XTREAM_PROXY_READ_TIMEOUT = max(10.0, float(os.environ.get("XTREAM_PROXY_READ_TIMEOUT_SECONDS", "45")))

client = TelegramClient(None, API_ID, API_HASH)
channel_cache = {}
media_cache = {}
stream_slots = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)
active_streams = 0
total_stream_requests = 0
range_requests = 0
stream_failures = 0
stream_retries = 0
stream_rejections = 0
bytes_served = 0


async def refresh_channel_cache():
    try:
        dialogs = await client.get_dialogs(limit=None)
        for dialog in dialogs:
            entity = dialog.entity
            try:
                marked_id = utils.get_peer_id(entity)
            except Exception:
                continue
            channel_cache[marked_id] = entity
    except Exception:
        # Streaming can still attempt lazy resolution below.
        pass


async def configure_bot_webhook():
    if not TELEGRAM_WEBHOOK_URL or not TELEGRAM_BOT_SECRET:
        return
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            response = await http.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                json={
                    "url": TELEGRAM_WEBHOOK_URL,
                    "secret_token": TELEGRAM_BOT_SECRET,
                    "allowed_updates": ["message", "callback_query"],
                    "drop_pending_updates": False,
                },
            )
            payload = response.json()
            if not response.is_success or not payload.get("ok"):
                print("Telegram webhook configuration failed:", payload)
    except Exception as exc:
        print("Telegram webhook configuration error:", repr(exc))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await client.start(bot_token=BOT_TOKEN)
    await refresh_channel_cache()
    await configure_bot_webhook()
    yield
    await client.disconnect()


app = FastAPI(title="VAYZEN Telegram Streaming Gateway", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
)
  

def verify_edge_bridge(request: Request):
    if not EDGE_SHARED_SECRET:
        raise HTTPException(status_code=503, detail="Edge bridge is not configured")
    supplied = (request.headers.get("x-vayzen-edge-secret") or "").encode()
    if not hmac.compare_digest(EDGE_SHARED_SECRET, supplied):
        raise HTTPException(status_code=401, detail="Invalid edge bridge secret")


@app.post("/telegram/{method}")
async def telegram_api_proxy(method: str, request: Request):
    verify_edge_bridge(request)
    if not re.fullmatch(r"[A-Za-z0-9_]+", method):
        raise HTTPException(status_code=400, detail="Invalid Telegram method")
    raw = await request.body()
    headers = {}
    content_type = request.headers.get("content-type")
    if content_type:
        headers["Content-Type"] = content_type
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http:
        upstream = await http.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/{method}",
            content=raw,
            headers=headers,
        )
    out_headers = {}
    if upstream.headers.get("content-type"):
        out_headers["Content-Type"] = upstream.headers["content-type"]
    return Response(content=upstream.content, status_code=upstream.status_code, headers=out_headers)


@app.api_route("/telegram/file/{file_path:path}", methods=["GET", "HEAD"])
async def telegram_file_proxy(file_path: str, request: Request):
    verify_edge_bridge(request)
    if not file_path or ".." in file_path:
        raise HTTPException(status_code=400, detail="Invalid Telegram file path")
    http = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=15.0), follow_redirects=True)
    try:
        upstream_request = http.build_request(
            request.method,
            f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}",
        )
        upstream = await http.send(upstream_request, stream=True)
    except Exception as exc:
        await http.aclose()
        raise HTTPException(status_code=502, detail="Telegram file proxy failed") from exc

    out_headers = {
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
    }
    for key in ("content-length", "content-range", "accept-ranges", "content-disposition"):
        value = upstream.headers.get(key)
        if value:
            out_headers[key.title()] = value
    content_type = upstream.headers.get("content-type") or "application/octet-stream"

    if request.method == "HEAD":
        status = upstream.status_code
        await upstream.aclose()
        await http.aclose()
        return Response(status_code=status, headers=out_headers, media_type=content_type)

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await http.aclose()

    return StreamingResponse(body(), status_code=upstream.status_code, headers=out_headers, media_type=content_type)



def _document_filename(message) -> str:
    document = getattr(message, "document", None)
    if not document:
        return ""
    for attr in getattr(document, "attributes", []) or []:
        name = getattr(attr, "file_name", None)
        if name:
            return str(name)
    return ""


@app.get("/legacy/backups")
async def discover_legacy_backups(request: Request):
    verify_edge_bridge(request)
    found = []
    try:
        dialogs = await client.get_dialogs(limit=None)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to list Telegram dialogs") from exc

    for dialog in dialogs[:80]:
        entity = dialog.entity
        try:
            chat_id = utils.get_peer_id(entity)
        except Exception:
            continue
        title = str(
            getattr(dialog, "name", None)
            or getattr(entity, "title", None)
            or getattr(entity, "username", None)
            or chat_id
        )
        try:
            async for message in client.iter_messages(entity, limit=250):
                filename = _document_filename(message)
                caption = str(getattr(message, "message", "") or "")
                if not (
                    filename.lower().startswith("vayzen-bkp-")
                    or "VAYZEN Metadata Backup" in caption
                    or "VAYZEN Backup" in caption
                ):
                    continue
                document = getattr(message, "document", None)
                found.append({
                    "chat_id": int(chat_id),
                    "chat_title": title[:160],
                    "message_id": int(message.id),
                    "filename": filename[:240],
                    "date": message.date.isoformat() if getattr(message, "date", None) else None,
                    "size": int(getattr(document, "size", 0) or 0),
                })
                if len(found) >= 30:
                    break
        except Exception:
            continue
        if len(found) >= 30:
            break

    found.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {"ok": True, "backups": found}



@app.get("/legacy/backups/{chat_id}")
async def discover_legacy_backups_in_channel(chat_id: int, request: Request):
    verify_edge_bridge(request)
    entity = await get_channel(chat_id)
    title = str(
        getattr(entity, "title", None)
        or getattr(entity, "username", None)
        or chat_id
    )
    found = []
    try:
        async for message in client.iter_messages(entity, limit=500):
            filename = _document_filename(message)
            caption = str(getattr(message, "message", "") or "")
            if not (
                filename.lower().startswith("vayzen-bkp-")
                or "VAYZEN Metadata Backup" in caption
                or "VAYZEN Backup" in caption
            ):
                continue
            document = getattr(message, "document", None)
            found.append({
                "chat_id": int(chat_id),
                "chat_title": title[:160],
                "message_id": int(message.id),
                "filename": filename[:240],
                "date": message.date.isoformat() if getattr(message, "date", None) else None,
                "size": int(getattr(document, "size", 0) or 0),
            })
            if len(found) >= 20:
                break
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to scan Telegram channel") from exc
    found.sort(key=lambda x: x.get("date") or "", reverse=True)
    return {"ok": True, "chat_id": chat_id, "chat_title": title, "backups": found}


@app.get("/legacy/backup/{chat_id}/{message_id}")
async def fetch_legacy_backup(chat_id: int, message_id: int, request: Request):
    verify_edge_bridge(request)
    entity = await get_channel(chat_id)
    try:
        message = await client.get_messages(entity, ids=message_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Backup message lookup failed") from exc
    if not message:
        raise HTTPException(status_code=404, detail="Backup message not found")
    filename = _document_filename(message)
    caption = str(getattr(message, "message", "") or "")
    if not (
        filename.lower().startswith("vayzen-bkp-")
        or "VAYZEN Metadata Backup" in caption
        or "VAYZEN Backup" in caption
    ):
        raise HTTPException(status_code=404, detail="Message is not a VAYZEN backup")
    try:
        raw = await client.download_media(message, file=bytes)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Backup download failed") from exc
    if not raw:
        raise HTTPException(status_code=404, detail="Backup file is empty")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Backup file too large")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Backup JSON is invalid") from exc
    if payload.get("format") != "vayzen-metadata-backup-v1":
        raise HTTPException(status_code=422, detail="Unsupported backup format")
    return payload

def parse_range(value: str | None, total: int):
    if not value:
        start = 0
        end = min(total - 1, MAX_RANGE_WINDOW - 1)
        return start, end, end < total - 1

    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Invalid Range header")
    first, last = match.groups()
    if first == "":
        suffix = int(last or "0")
        if suffix <= 0:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        suffix = min(suffix, MAX_RANGE_WINDOW)
        start = max(total - suffix, 0)
        end = total - 1
    else:
        start = int(first)
        requested_end = int(last) if last else total - 1
        end = min(requested_end, total - 1, start + MAX_RANGE_WINDOW - 1)

    if start < 0 or start >= total or end < start:
        raise HTTPException(status_code=416, detail="Range not satisfiable")
    return start, end, True


def verify_signature(channel_id: int, message_id: int, exp: int, sig: str):
    if not STREAM_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Streaming secret is not configured")
    if exp < int(time.time()) - 5:
        raise HTTPException(status_code=401, detail="Stream link expired")
    payload = f"{channel_id}:{message_id}:{exp}".encode()
    expected = hmac.new(STREAM_SIGNING_SECRET, payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig or ""):
        raise HTTPException(status_code=401, detail="Invalid stream signature")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _xtream_proxy_key() -> bytes:
    if not STREAM_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Streaming secret is not configured")
    return hashlib.sha256(b"vayzen:xtream-proxy:v1:" + STREAM_SIGNING_SECRET).digest()


def encrypt_xtream_target(url: str, exp: int | None = None) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Unsupported upstream URL")
    expires = int(exp or (time.time() + XTREAM_PROXY_TTL_SECONDS))
    payload = json.dumps({"u": url, "e": expires}, separators=(",", ":")).encode()
    nonce = os.urandom(12)
    encrypted = AESGCM(_xtream_proxy_key()).encrypt(nonce, payload, b"vayzen-xtream-v1")
    return "v1." + _b64url_encode(nonce + encrypted)


def decrypt_xtream_target(token: str) -> tuple[str, int]:
    if not token.startswith("v1.") or len(token) > 8192:
        raise HTTPException(status_code=401, detail="Invalid Xtream stream token")
    try:
        raw = _b64url_decode(token[3:])
        if len(raw) < 29:
            raise ValueError("short token")
        nonce, encrypted = raw[:12], raw[12:]
        payload = AESGCM(_xtream_proxy_key()).decrypt(nonce, encrypted, b"vayzen-xtream-v1")
        data = json.loads(payload.decode())
        url = str(data.get("u") or "")
        exp = int(data.get("e") or 0)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Xtream stream token") from exc
    if exp < int(time.time()) - 5:
        raise HTTPException(status_code=401, detail="Xtream stream link expired")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid Xtream upstream URL")
    return url, exp


def xtream_proxy_path(url: str, exp: int) -> str:
    return "/xtream/" + encrypt_xtream_target(url, exp)


def rewrite_hls_playlist(text: str, source_url: str, exp: int) -> str:
    def rewrite_uri_attr(match):
        raw = match.group(1)
        if raw.startswith(("data:", "blob:")):
            return match.group(0)
        absolute = urljoin(source_url, raw)
        return 'URI="' + xtream_proxy_path(absolute, exp) + '"'

    out = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if not stripped:
            out.append(line)
            continue
        if stripped.startswith("#"):
            out.append(re.sub(r'URI="([^"]+)"', rewrite_uri_attr, line))
            continue
        if stripped.startswith(("data:", "blob:")):
            out.append(line)
            continue
        absolute = urljoin(source_url, stripped)
        out.append(xtream_proxy_path(absolute, exp))
    return "\n".join(out)


def upstream_headers(request: Request, target: str):
    parsed = urlparse(target)
    headers = {
        "Accept": request.headers.get("accept") or "*/*",
        "User-Agent": "VAYZEN/1.0",
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
    }
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header
    return headers


async def get_channel(channel_id: int):
    if channel_id in channel_cache:
        return channel_cache[channel_id]

    # In-memory Telethon sessions may not know the access hash for a numeric
    # -100... channel ID until dialogs have been loaded. Refresh once before
    # falling back to normal entity resolution.
    await refresh_channel_cache()
    if channel_id in channel_cache:
        return channel_cache[channel_id]

    try:
        entity = await client.get_entity(channel_id)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail="Telegram channel unavailable to streaming bot",
        ) from exc
    channel_cache[channel_id] = entity
    return entity


async def get_media(channel_id: int, message_id: int, force_refresh: bool = False):
    key = (channel_id, message_id)
    now = time.monotonic()
    cached = media_cache.get(key)
    if not force_refresh and cached and now - cached["at"] < MEDIA_CACHE_TTL:
        return cached["message"], cached["size"], cached["mime"], cached["name"]

    entity = await get_channel(channel_id)
    try:
        message = await client.get_messages(entity, ids=message_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Telegram media lookup failed") from exc
    if not message or not message.media or not message.file:
        media_cache.pop(key, None)
        raise HTTPException(status_code=404, detail="Media not found")
    size = int(message.file.size or 0)
    if size <= 0:
        raise HTTPException(status_code=404, detail="Media size unavailable")
    if size > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Media exceeds configured VAYZEN limit")
    mime = message.file.mime_type or "application/octet-stream"
    name = (message.file.name or f"vayzen-{message_id}").replace('"', "").replace("\n", " ")

    if len(media_cache) >= MEDIA_CACHE_MAX:
        oldest = min(media_cache, key=lambda k: media_cache[k]["at"])
        media_cache.pop(oldest, None)
    media_cache[key] = {"at": now, "message": message, "size": size, "mime": mime, "name": name}
    return message, size, mime, name


@app.get("/")
async def root():
    return FileResponse("/app/web/index.html", media_type="text/html; charset=utf-8")


@app.get("/styles.css")
async def styles():
    return FileResponse("/app/web/styles.css", media_type="text/css; charset=utf-8")


@app.get("/app.js")
async def app_js():
    return FileResponse("/app/web/app.js", media_type="application/javascript; charset=utf-8")


@app.api_route("/api", methods=["GET", "POST", "OPTIONS"])
async def api_proxy(request: Request):
    if not VAYZEN_API_TARGET:
        raise HTTPException(status_code=503, detail="API target is not configured")

    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    origin = f"{proto}://{host}" if host else ""

    headers = {"Origin": origin} if origin else {}
    content_type = request.headers.get("content-type")
    authorization = request.headers.get("authorization")
    if content_type:
        headers["Content-Type"] = content_type
    if authorization:
        headers["Authorization"] = authorization

    body = await request.body()
    target = VAYZEN_API_TARGET
    if request.url.query:
        target += "?" + request.url.query

    async with httpx.AsyncClient(follow_redirects=False, timeout=60.0) as http:
        upstream = await http.request(
            request.method,
            target,
            content=body if body else None,
            headers=headers,
        )

    out_headers = {}
    for key in ("content-type", "location", "cache-control", "content-length"):
        value = upstream.headers.get(key)
        if value:
            out_headers[key] = value

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=out_headers,
    )


@app.get("/health")
async def health():
    return {
        "ok": client.is_connected(),
        "service": "vayzen-gateway",
        "storage": "telegram",
        "range_streaming": True,
        "chunk_size_kb": CHUNK_SIZE // 1024,
        "range_window_mb": MAX_RANGE_WINDOW // (1024 * 1024),
        "max_media_mb": MAX_MEDIA_BYTES // (1024 * 1024),
        "chunk_timeout_seconds": STREAM_CHUNK_TIMEOUT,
        "read_retries": STREAM_READ_RETRIES,
        "queue_timeout_seconds": STREAM_QUEUE_TIMEOUT,
        "active_streams": active_streams,
        "max_concurrent_streams": MAX_CONCURRENT_STREAMS,
        "available_stream_slots": max(0, MAX_CONCURRENT_STREAMS - active_streams),
        "total_stream_requests": total_stream_requests,
        "range_requests": range_requests,
        "stream_failures": stream_failures,
        "stream_retries": stream_retries,
        "stream_rejections": stream_rejections,
        "bytes_served": bytes_served,
        "signed_streams": bool(STREAM_SIGNING_SECRET),
        "xtream_private_proxy": bool(STREAM_SIGNING_SECRET),
        "xtream_proxy_ttl_seconds": XTREAM_PROXY_TTL_SECONDS,
        "cached_channels": len(channel_cache),
        "cached_media": len(media_cache),
    }


@app.api_route("/xtream/{token}", methods=["GET", "HEAD"])
async def xtream_proxy(token: str, request: Request):
    target, exp = decrypt_xtream_target(token)
    timeout = httpx.Timeout(
        connect=XTREAM_PROXY_CONNECT_TIMEOUT,
        read=XTREAM_PROXY_READ_TIMEOUT,
        write=XTREAM_PROXY_READ_TIMEOUT,
        pool=XTREAM_PROXY_CONNECT_TIMEOUT,
    )
    headers = upstream_headers(request, target)
    client_http = httpx.AsyncClient(follow_redirects=True, timeout=timeout)

    try:
        upstream_request = client_http.build_request(request.method, target, headers=headers)
        upstream = await client_http.send(upstream_request, stream=True)
    except Exception as exc:
        await client_http.aclose()
        raise HTTPException(status_code=502, detail="Xtream upstream connection failed") from exc

    content_type = (upstream.headers.get("content-type") or "application/octet-stream").split(";")[0].strip().lower()
    final_url = str(upstream.url)
    is_hls = (
        "mpegurl" in content_type
        or final_url.lower().split("?", 1)[0].endswith(".m3u8")
        or target.lower().split("?", 1)[0].endswith(".m3u8")
    )

    if request.method == "HEAD":
        out_headers = {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        }
        for key in ("content-length", "content-range", "accept-ranges"):
            value = upstream.headers.get(key)
            if value:
                out_headers[key.title()] = value
        status = upstream.status_code
        await upstream.aclose()
        await client_http.aclose()
        return Response(status_code=status, headers=out_headers, media_type=content_type)

    if is_hls:
        try:
            raw = await upstream.aread()
            playlist = raw.decode("utf-8", errors="replace")
            rewritten = rewrite_hls_playlist(playlist, final_url, exp)
        finally:
            await upstream.aclose()
            await client_http.aclose()
        return Response(
            content=rewritten,
            status_code=upstream.status_code,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    out_headers = {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    }
    for key in ("content-length", "content-range", "accept-ranges"):
        value = upstream.headers.get(key)
        if value:
            out_headers[key.title()] = value

    async def proxy_body():
        try:
            async for chunk in upstream.aiter_bytes(CHUNK_SIZE):
                if await request.is_disconnected():
                    break
                if chunk:
                    yield chunk
        finally:
            await upstream.aclose()
            await client_http.aclose()

    return StreamingResponse(
        proxy_body(),
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=content_type,
    )


@app.api_route("/stream/{channel_id}/{message_id}", methods=["GET", "HEAD"])
async def stream(channel_id: int, message_id: int, request: Request, exp: int, sig: str):
    global active_streams, total_stream_requests, range_requests
    global stream_failures, stream_retries, stream_rejections, bytes_served

    verify_signature(channel_id, message_id, exp, sig)
    message, total, mime, name = await get_media(channel_id, message_id)
    range_header = request.headers.get("range")
    total_stream_requests += 1
    if range_header:
        range_requests += 1

    if request.method == "HEAD" and not range_header:
        start, end, partial = 0, total - 1, False
    else:
        start, end, partial = parse_range(range_header, total)
    length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Disposition": f'inline; filename="{name}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{total}"
    status = 206 if partial else 200
    if request.method == "HEAD":
        return Response(status_code=status, headers=headers, media_type=mime)

    try:
        await asyncio.wait_for(stream_slots.acquire(), timeout=STREAM_QUEUE_TIMEOUT)
    except asyncio.TimeoutError as exc:
        stream_rejections += 1
        raise HTTPException(
            status_code=503,
            detail="Streaming capacity is busy; retry shortly",
            headers={"Retry-After": "3"},
        ) from exc

    active_streams += 1

    async def body():
        global active_streams, stream_failures, stream_retries, bytes_served
        remaining = length
        position = start
        failures = 0
        current_message = message
        try:
            while remaining > 0:
                if await request.is_disconnected():
                    break
                try:
                    iterator = client.iter_download(
                        current_message.media,
                        offset=position,
                        request_size=CHUNK_SIZE,
                        chunk_size=CHUNK_SIZE,
                    ).__aiter__()
                    while remaining > 0:
                        if await request.is_disconnected():
                            return
                        try:
                            chunk = await asyncio.wait_for(
                                iterator.__anext__(),
                                timeout=STREAM_CHUNK_TIMEOUT,
                            )
                        except StopAsyncIteration:
                            if remaining > 0:
                                raise RuntimeError("Telegram stream ended before requested range completed")
                            break
                        if not chunk:
                            raise RuntimeError("Telegram returned an empty media chunk")
                        if len(chunk) > remaining:
                            chunk = chunk[:remaining]
                        position += len(chunk)
                        remaining -= len(chunk)
                        bytes_served += len(chunk)
                        failures = 0
                        yield chunk
                    break
                except asyncio.CancelledError:
                    raise
                except Exception:
                    failures += 1
                    if failures > STREAM_READ_RETRIES:
                        stream_failures += 1
                        raise
                    stream_retries += 1
                    if not client.is_connected():
                        try:
                            await client.connect()
                        except Exception:
                            pass
                    try:
                        current_message, refreshed_total, _, _ = await get_media(
                            channel_id, message_id, force_refresh=True
                        )
                        if refreshed_total != total:
                            raise RuntimeError("Telegram media size changed during stream")
                    except HTTPException:
                        if failures > STREAM_READ_RETRIES:
                            raise
                    await asyncio.sleep(min(2.5, 0.4 * (2 ** (failures - 1))))
        finally:
            active_streams = max(0, active_streams - 1)
            stream_slots.release()

    return StreamingResponse(body(), status_code=status, headers=headers, media_type=mime)
