"""
FastAPI application entry point for the CV Enhancer microservice.
"""

import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from presentation.analyses import router as analyses_router
from presentation.api import router as cv_router
from presentation.resumes import router as resumes_router

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup validation & singleton warm-up
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Validate environment, warm up singletons, and log startup/shutdown."""
    logger.info("Radiance CV Enhancer service starting up…")

    # Import here so env validation errors surface immediately at startup
    # rather than on the first request.
    from container import (
        get_analyze_cv_use_case,
        get_enhance_cv_use_case,
        get_job_repository,
        get_latex_compiler,
        get_storage_service,
    )

    get_enhance_cv_use_case()   # legacy pipeline
    get_storage_service()       # S3 adapter
    get_latex_compiler()        # Jinja2 + pdflatex
    get_job_repository()        # in-memory store
    get_analyze_cv_use_case()   # new async pipeline

    logger.info("All dependencies initialised. Service is ready to accept requests.")
    yield
    logger.info("Radiance CV Enhancer service shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Radiance — CV Enhancer",
    description=(
        "AI-powered CV enhancement microservice for the Radiance Career Assistant. "
        "Parses a candidate's CV (PDF), compares it to a Job Description, "
        "calculates an ATS matching score, identifies skill gaps and red flags, "
        "and rewrites the experience section using the STAR method — "
        "powered by Gemini 1.5 Flash via LangGraph. "
        "Supports both synchronous (legacy) and asynchronous (polling) workflows."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(cv_router)        # POST /api/v1/cv/enhance  (legacy)
app.include_router(resumes_router)   # POST /api/v1/resumes/upload-urls
app.include_router(analyses_router)  # POST /api/v1/analyses  |  GET /api/v1/analyses/{id}


# ---------------------------------------------------------------------------
# Health probe
# ---------------------------------------------------------------------------


@app.get("/health", tags=["Health"], summary="Liveness probe")
async def health_check() -> dict:
    return {"status": "healthy", "service": "cv-enhancer", "version": "2.0.0"}


# ---------------------------------------------------------------------------
# Local development entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
