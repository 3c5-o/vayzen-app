FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY gateway/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY gateway/app.py /app/app.py
COPY index.html /app/web/index.html
COPY styles.css /app/web/styles.css
COPY app.js /app/web/app.js

EXPOSE 10000

CMD ["sh","-c","uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}"]
