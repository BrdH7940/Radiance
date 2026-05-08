"""
Dependency Injection container for the CV Enhancer service.

Each provider function is decorated with @lru_cache(maxsize=1) to produce
a singleton instance that is reused across all requests. This pattern avoids
re-initialising heavy objects (LLM clients, compiled LangGraph graphs, etc.)
on every HTTP request while remaining testable via cache_clear().

Dependency graph
----------------
AppSettings
  ├─ S3StorageAdapter              (implements core.ports.storage_port.IStorageService)
  ├─ PDFPlumberParser              (implements core.ports.document_parser_port.IDocumentParser)
  ├─ GeminiLLMAdapter              (implements core.ports.llm_port.ILLMService)
  ├─ DynamoJobRepository           (implements core.ports.job_repository_port.IJobRepository)
  ├─ SQSService                    (implements core.ports.sqs_port.ISQSService)
  ├─ WeasyPrintPDFAdapter          (implements core.ports.pdf_render_port.IPDFRenderService)
  ├─ SupabaseProjectRepository     (implements core.ports.project_repository_port.IProjectRepository)
  ├─ SupabaseHistoryRepository     (implements core.ports.history_repository_port.IHistoryRepository)
  └─ AnalyzeCVUseCase              ← consumes the above
"""

import logging
from functools import lru_cache
from pathlib import Path

from config import AppSettings, get_settings
from core.ports.document_parser_port import IDocumentParser
from core.ports.history_repository_port import IHistoryRepository
from core.ports.job_notifier_port import IJobNotifier
from core.ports.job_repository_port import IJobRepository
from core.ports.llm_port import ILLMService
from core.ports.pdf_render_port import IPDFRenderService
from core.ports.project_repository_port import IProjectRepository
from core.ports.sqs_port import ISQSService
from core.ports.storage_port import IStorageService
from core.use_cases.analyze_cv_use_case import AnalyzeCVUseCase
from infrastructure.adapters.dynamo_job_repository import DynamoJobRepository
from infrastructure.adapters.fallback_llm_adapter import FallbackLLMAdapter
from infrastructure.adapters.gemini_llm_adapter import GeminiLLMAdapter
from infrastructure.adapters.groq_llm_adapter import GroqLLMAdapter
from infrastructure.adapters.supabase_client import get_supabase_client
from infrastructure.adapters.supabase_history_repository import SupabaseHistoryRepository
from infrastructure.adapters.supabase_project_repository import SupabaseProjectRepository
from infrastructure.adapters.supabase_realtime_notifier import SupabaseRealtimeNotifier
from infrastructure.adapters.sqs_service import SQSService
from infrastructure.adapters.weasyprint_pdf_adapter import WeasyPrintPDFAdapter
from infrastructure.parsers.pdfplumber_adapter import PDFPlumberParser
from infrastructure.storage.s3_storage import S3StorageAdapter

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
def get_document_parser() -> IDocumentParser:
    """Singleton pdfplumber PDF parser."""
    logger.info("Initialising PDFPlumberParser…")
    return PDFPlumberParser()


# ---------------------------------------------------------------------------
# Core pipeline providers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_llm_service() -> ILLMService:
    """Return the LLM service, optionally wrapped with a Groq fallback.

    When GROQ_API_KEY is set in the environment, requests are first tried on
    Gemini. If Gemini raises any exception (429, 503, timeout, etc.),
    FallbackLLMAdapter transparently retries the same call on Groq so the
    analysis job still completes successfully.

    When GROQ_API_KEY is absent, behaviour is identical to the previous
    single-adapter setup.
    """
    settings: AppSettings = get_settings()
    logger.info("Initialising GeminiLLMAdapter (model: '%s')…", settings.gemini_model)
    gemini = GeminiLLMAdapter(
        api_key=settings.google_api_key,
        model=settings.gemini_model,
    )

    if settings.groq_api_key:
        logger.info(
            "Groq fallback enabled — GroqLLMAdapter (model: '%s') will be used "
            "when Gemini is unavailable.",
            settings.groq_model,
        )
        groq = GroqLLMAdapter(
            api_key=settings.groq_api_key,
            model=settings.groq_model,
        )
        return FallbackLLMAdapter(primary=gemini, fallback=groq)

    logger.info("Groq fallback not configured (GROQ_API_KEY not set). Using Gemini only.")
    return gemini


@lru_cache(maxsize=1)
def get_job_repository() -> IJobRepository:
    """Singleton DynamoJobRepository — shared, persistent job store."""
    settings: AppSettings = get_settings()
    logger.info("Initialising DynamoJobRepository (table: '%s')…", settings.dynamodb_table_name)
    return DynamoJobRepository(
        table_name=settings.dynamodb_table_name,
        region_name=settings.aws_region,
        endpoint_url=getattr(settings, "dynamodb_endpoint_url", None),
        user_id=settings.analysis_user_id,
    )


@lru_cache(maxsize=1)
def get_sqs_service() -> ISQSService:
    """Singleton SQSService for sending jobs to SQS."""
    settings: AppSettings = get_settings()
    logger.info("Initialising SQSService (queue: '%s')…", settings.sqs_queue_url)
    return SQSService(
        queue_url=settings.sqs_queue_url,
        region_name=settings.aws_region,
        endpoint_url=getattr(settings, "sqs_endpoint_url", None),
    )


@lru_cache(maxsize=1)
def get_pdf_renderer() -> IPDFRenderService:
    """Singleton WeasyPrintPDFAdapter backed by Jinja2 HTML template."""
    logger.info("Initialising WeasyPrintPDFAdapter (templates: '%s')…", _TEMPLATES_DIR)
    return WeasyPrintPDFAdapter(template_dir=_TEMPLATES_DIR)


@lru_cache(maxsize=1)
def get_project_repository() -> IProjectRepository:
    """Singleton SupabaseProjectRepository for the Project Gallery."""
    logger.info("Initialising SupabaseProjectRepository…")
    return SupabaseProjectRepository(client=get_supabase_client())


@lru_cache(maxsize=1)
def get_history_repository() -> IHistoryRepository:
    """Singleton SupabaseHistoryRepository for CV History."""
    logger.info("Initialising SupabaseHistoryRepository…")
    return SupabaseHistoryRepository(client=get_supabase_client())


@lru_cache(maxsize=1)
def get_job_notifier() -> IJobNotifier:
    """Singleton SupabaseRealtimeNotifier for broadcasting job status events."""
    settings = get_settings()
    logger.info("Initialising SupabaseRealtimeNotifier…")
    return SupabaseRealtimeNotifier(
        supabase_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
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
        history_repo=get_history_repository(),
        job_notifier=get_job_notifier(),
    )
    logger.info("AnalyzeCVUseCase wired successfully.")
    return use_case
