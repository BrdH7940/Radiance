"""Lambda ASGI bootstrap used by the container image.
It tries several common entrypoints inside the service (e.g. `main.py` with `app`).
If none is found it exposes a simple /health endpoint.

Requirements: the service you build should expose a FastAPI (or ASGI) app named `app` in a top-level module
(e.g. `services/<service>/main.py` defines `app = FastAPI()`).
"""
from mangum import Mangum
import importlib
import os
from fastapi import FastAPI

SERVICE = os.environ.get("SERVICE") or ""


def _load_app():
    # Common module names we try to import from the copied service files
    candidates = [
        "main",
        "app",
        "lambda_function",
        f"{SERVICE}.main",
        f"{SERVICE}.app",
    ]

    for mod in candidates:
        try:
            m = importlib.import_module(mod)
            if hasattr(m, "app"):
                return getattr(m, "app")
            if hasattr(m, "application"):
                return getattr(m, "application")
        except Exception:
            continue

    # Fallback health-only app
    app = FastAPI()

    @app.get("/health")
    def _health():
        return {"status": "ok"}

    return app


application = _load_app()
handler = Mangum(application)
