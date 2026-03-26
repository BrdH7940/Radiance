# ── Stage: base image ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System packages:
#   - WeasyPrint runtime deps (Pango, HarfBuzz, Cairo, GDK-Pixbuf, libffi, JPEG, OpenJPEG)
#   - fonts-liberation: provides metric-compatible Liberation fonts (Arial/Times/Courier)
#     so WeasyPrint can render PDFs without missing-font fallback issues
#   pdfplumber is pure-Python (pdfminer.six + Pillow) — no extra system libs required.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libharfbuzz0b \
        libpangoft2-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        shared-mime-info \
        libffi-dev \
        libjpeg-dev \
        libopenjp2-7-dev \
        fonts-liberation \
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

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--app-dir", "/app/src", \
     "--reload"]

