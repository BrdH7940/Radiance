# ── Stage: base image ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System packages required by Docling's vision pipeline (poppler for PDF rendering,
# libgl / libglib for OpenCV used internally by some Docling models),
# plus a TeX Live subset with all packages used in resume_template.tex.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        poppler-utils \
        texlive-latex-base \        # article, inputenc, fontenc, core LaTeX
        texlive-latex-recommended \ # geometry, parskip, hyperref helpers, etc.
        texlive-fonts-recommended \ # font sets commonly used with lmodern
        lmodern \                   # explicit Latin Modern fonts (lmodern.sty)
        texlive-latex-extra \       # enumitem, titlesec, and other extras
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

# For development we enable uvicorn's auto-reload so that code changes under
# /app/src (including from a bind mount) are picked up without rebuilding
# the image each time.
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--app-dir", "/app/src", \
     "--reload"]

