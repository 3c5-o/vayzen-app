FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY gateway/media-worker-requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY gateway/media_worker.py /app/media_worker.py

EXPOSE 10000

CMD ["sh","-c","uvicorn media_worker:app --host 0.0.0.0 --port ${PORT:-10000}"]
