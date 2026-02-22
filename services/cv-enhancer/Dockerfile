# ── Stage: base image ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System packages required by Docling's vision pipeline (poppler for PDF rendering,
# libgl / libglib for OpenCV used internally by some Docling models).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Stage: install dependencies ────────────────────────────────────────────────
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage: copy application source ─────────────────────────────────────────────
COPY src/ ./src/

# Add src/ to PYTHONPATH so all intra-service imports resolve without a package prefix.
# e.g.  "from domain.models import ..."  works from any file under src/.
ENV PYTHONPATH=/app/src

# ── Runtime ────────────────────────────────────────────────────────────────────
EXPOSE 8000

# uvicorn --app-dir tells uvicorn to prepend /app/src to sys.path and look for
# the 'main' module there, which imports the FastAPI 'app' object.
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--app-dir", "/app/src", \
     "--workers", "1"]

