"""
Dependency Injection container for the CV Enhancer service.

Each provider function is decorated with @lru_cache(maxsize=1) to produce
a singleton instance that is reused across all requests. This pattern avoids
re-initialising heavy objects (LLM clients, compiled LangGraph graphs, etc.)
on every HTTP request while remaining testable via cache_clear().

Dependency graph
----------------
AppSettings
  ├─ S3StorageAdapter         (implements IStorageService)
  ├─ DoclingParser            (implements IDocumentParser)
  ├─ GeminiLLMAdapter         (implements ILLMService)
  ├─ InMemoryJobRepository    (implements IJobRepository)
  ├─ WeasyPrintPDFAdapter     (implements IPDFRenderService)
  ├─ EditorAIGeminiAdapter    (implements IEditorAIService)
  └─ AnalyzeCVUseCase         ← consumes all five above
"""

import logging
from functools import lru_cache
from pathlib import Path

from config import AppSettings, get_settings
from core.ports.editor_ai_port import IEditorAIService
from core.ports.job_repository_port import IJobRepository
from core.ports.llm_port import ILLMService
from core.ports.pdf_render_port import IPDFRenderService
from core.use_cases.analyze_cv_use_case import AnalyzeCVUseCase
from domain.ports import IStorageService
from infrastructure.adapters.editor_ai_gemini_adapter import EditorAIGeminiAdapter
from infrastructure.adapters.gemini_llm_adapter import GeminiLLMAdapter
from infrastructure.adapters.in_memory_job_repository import InMemoryJobRepository
from infrastructure.adapters.weasyprint_pdf_adapter import WeasyPrintPDFAdapter
from infrastructure.parsers.docling_adapter import DoclingParser
from infrastructure.storage.s3_storage import S3StorageAdapter
from infrastructure.adapters.dynamo_job_repository import DynamoJobRepository
from infrastructure.adapters.sqs_service import SQSService

logger = logging.getLogger(__name__)

# Absolute path to the Jinja2 HTML templates directory.
_TEMPLATES_DIR = str(Path(__file__).parent / "infrastructure" / "templates")


# ---------------------------------------------------------------------------
# Shared infrastructure providers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_storage_service() -> IStorageService:
    """Singleton S3StorageAdapter — the sole implementation of IStorageService."""
    settings: AppSettings = get_settings()
    logger.info(
        "Initialising S3StorageAdapter (bucket: '%s', region: '%s')…",
        settings.s3_bucket,
        settings.aws_region,
    )
    return S3StorageAdapter(settings=settings)


@lru_cache(maxsize=1)
def get_document_parser() -> DoclingParser:
    """Singleton Docling PDF parser."""
    logger.info("Initialising DoclingParser…")
    return DoclingParser()


# ---------------------------------------------------------------------------
# Core pipeline providers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_llm_service() -> ILLMService:
    """Singleton GeminiLLMAdapter (Analyzer → Enhancer LangGraph graph)."""
    settings: AppSettings = get_settings()
    logger.info("Initialising GeminiLLMAdapter (model: '%s')…", settings.gemini_model)
    return GeminiLLMAdapter(
        api_key=settings.google_api_key,
        model=settings.gemini_model,
    )


@lru_cache(maxsize=1)
def get_job_repository() -> IJobRepository:
    """Singleton InMemoryJobRepository — swap for DynamoDBJobRepository in prod."""
    logger.info("Initialising InMemoryJobRepository…")
    return DynamoJobRepository(table_name="analysis_jobs")


@lru_cache(maxsize=1)
def get_sqs_service() -> SQSService:
    """Singleton SQSService for sending jobs to SQS."""
    logger.info("Initialising SQSService…")
    return SQSService()


@lru_cache(maxsize=1)
def get_pdf_renderer() -> IPDFRenderService:
    """Singleton WeasyPrintPDFAdapter backed by Jinja2 HTML template."""
    logger.info("Initialising WeasyPrintPDFAdapter (templates: '%s')…", _TEMPLATES_DIR)
    return WeasyPrintPDFAdapter(template_dir=_TEMPLATES_DIR)


@lru_cache(maxsize=1)
def get_editor_ai_service() -> IEditorAIService:
    """Singleton EditorAIGeminiAdapter for plain-text CV field refinement."""
    settings: AppSettings = get_settings()
    logger.info(
        "Initialising EditorAIGeminiAdapter (model: '%s')…", settings.gemini_model
    )
    return EditorAIGeminiAdapter(
        api_key=settings.google_api_key,
        model=settings.gemini_model,
    )


@lru_cache(maxsize=1)
def get_analyze_cv_use_case() -> AnalyzeCVUseCase:
    """Singleton AnalyzeCVUseCase with all injected port implementations."""
    settings = get_settings()
    logger.info("Wiring AnalyzeCVUseCase dependencies…")
    use_case = AnalyzeCVUseCase(
        storage=get_storage_service(),
        parser=get_document_parser(),
        llm=get_llm_service(),
        job_repo=get_job_repository(),
        pdf_renderer=get_pdf_renderer(),
        settings=settings,
    )
    logger.info("AnalyzeCVUseCase wired successfully.")
    return use_case
