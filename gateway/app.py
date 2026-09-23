import asyncio
import hashlib
import hmac
import os
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from telethon import TelegramClient

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
STREAM_SIGNING_SECRET = os.environ.get("STREAM_SIGNING_SECRET", "").encode()
MAX_CONCURRENT_STREAMS = max(1, int(os.environ.get("MAX_CONCURRENT_STREAMS", "6")))
CHUNK_SIZE = 512 * 1024

client = TelegramClient(None, API_ID, API_HASH)
channel_cache = {}
stream_slots = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await client.start(bot_token=BOT_TOKEN)
    yield
    await client.disconnect()


app = FastAPI(title="VAYZEN Telegram Streaming Gateway", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
)


def parse_range(value: str | None, total: int):
    if not value:
        return 0, total - 1, False
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if not match:
        raise HTTPException(status_code=416, detail="Invalid Range header")
    first, last = match.groups()
    if first == "":
        suffix = int(last or "0")
        if suffix <= 0:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        start = max(total - suffix, 0)
        end = total - 1
    else:
        start = int(first)
        end = int(last) if last else total - 1
    if start < 0 or start >= total or end < start:
        raise HTTPException(status_code=416, detail="Range not satisfiable")
    return start, min(end, total - 1), True


def verify_signature(channel_id: int, message_id: int, exp: int, sig: str):
    if not STREAM_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Streaming secret is not configured")
    if exp < int(time.time()) - 5:
        raise HTTPException(status_code=401, detail="Stream link expired")
    payload = f"{channel_id}:{message_id}:{exp}".encode()
    expected = hmac.new(STREAM_SIGNING_SECRET, payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig or ""):
        raise HTTPException(status_code=401, detail="Invalid stream signature")


async def get_channel(channel_id: int):
    if channel_id in channel_cache:
        return channel_cache[channel_id]
    try:
        entity = await client.get_entity(channel_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Telegram channel unavailable") from exc
    channel_cache[channel_id] = entity
    return entity


async def get_media(channel_id: int, message_id: int):
    entity = await get_channel(channel_id)
    try:
        message = await client.get_messages(entity, ids=message_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Telegram media lookup failed") from exc
    if not message or not message.media or not message.file:
        raise HTTPException(status_code=404, detail="Media not found")
    size = int(message.file.size or 0)
    if size <= 0:
        raise HTTPException(status_code=404, detail="Media size unavailable")
    mime = message.file.mime_type or "application/octet-stream"
    name = (message.file.name or f"vayzen-{message_id}").replace('"', "").replace("\n", " ")
    return message, size, mime, name


@app.get("/")
async def root():
    return {"ok": True, "service": "vayzen-gateway", "storage": "telegram"}


@app.get("/health")
async def health():
    return {
        "ok": client.is_connected(),
        "service": "vayzen-gateway",
        "storage": "telegram",
        "range_streaming": True,
        "chunk_size_kb": CHUNK_SIZE // 1024,
        "max_concurrent_streams": MAX_CONCURRENT_STREAMS,
        "signed_streams": bool(STREAM_SIGNING_SECRET),
    }


@app.api_route("/stream/{channel_id}/{message_id}", methods=["GET", "HEAD"])
async def stream(channel_id: int, message_id: int, request: Request, exp: int, sig: str):
    verify_signature(channel_id, message_id, exp, sig)
    message, total, mime, name = await get_media(channel_id, message_id)
    start, end, partial = parse_range(request.headers.get("range"), total)
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

    async def body():
        remaining = length
        async with stream_slots:
            async for chunk in client.iter_download(
                message.media,
                offset=start,
                request_size=CHUNK_SIZE,
                chunk_size=CHUNK_SIZE,
            ):
                if remaining <= 0 or await request.is_disconnected():
                    break
                if len(chunk) > remaining:
                    chunk = chunk[:remaining]
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(body(), status_code=status, headers=headers, media_type=mime)
