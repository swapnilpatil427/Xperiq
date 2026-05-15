FROM python:3.12-slim

# Install system deps needed for psycopg binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (cache layer)
COPY agents/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy agents source
COPY agents/ /app/agents/

# Non-root user for security
RUN useradd -m -u 1001 appuser && chown -R appuser /app
USER appuser

ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "agents.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
