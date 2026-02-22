"""
FastAPI application entry point for the CV Enhancer microservice.
"""

import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from presentation.api import router

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup validation
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Validate environment and initialise the use case.
    """
    logger.info("CV Enhancer service starting up…")

    from container import get_enhance_cv_use_case

    get_enhance_cv_use_case()

    logger.info("CV Enhancer service is ready to accept requests.")
    yield
    logger.info("CV Enhancer service shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Radiance — CV Enhancer",
    description=(
        "AI-powered CV enhancement microservice for the Radiance Career Assistant. "
        "Parses a candidate's CV (PDF), compares it to a Job Description, "
        "calculates an ATS matching score, identifies skill gaps, and rewrites "
        "the experience section using the STAR method — powered by Gemini 1.5 Flash "
        "via LangGraph."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Later fix
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


# ---------------------------------------------------------------------------
# Health probe
# ---------------------------------------------------------------------------


@app.get("/health", tags=["Health"], summary="Liveness probe")
async def health_check() -> dict:
    return {"status": "healthy", "service": "cv-enhancer"}


# ---------------------------------------------------------------------------
# Local development entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
