"""
Dependency Injection container for the CV Enhancer service.
"""

import logging
import os
from functools import lru_cache

from application.use_cases.enhance_cv_use_case import EnhanceCVUseCase
from config import AppSettings, get_settings
from domain.ports import IStorageService
from infrastructure.ai.langgraph_agent import LangGraphCVEnhancer
from infrastructure.parsers.docling_adapter import DoclingParser
from infrastructure.storage.s3_storage import S3StorageAdapter

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_enhance_cv_use_case() -> EnhanceCVUseCase:
    """
    Create a single instance of the use case across all requests
    Never init twice -> Great for performance
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "Required environment variable 'GOOGLE_API_KEY' is not set. "
            "Set it before starting the service (e.g. in a .env file or ECS task definition)."
        )

    gemini_model = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")

    logger.info("Initialising CV Enhancer dependencies (model: '%s')...", gemini_model)

    parser = DoclingParser()
    agent = LangGraphCVEnhancer(api_key=api_key, model=gemini_model)
    use_case = EnhanceCVUseCase(parser=parser, agent=agent)

    logger.info("CV Enhancer dependencies wired successfully.")
    return use_case


@lru_cache(maxsize=1)
def get_storage_service() -> IStorageService:
    """Create a singleton instance of the storage service port implementation."""

    settings: AppSettings = get_settings()
    logger.info("Initialising S3 storage adapter for bucket '%s'...", settings.s3_bucket)
    return S3StorageAdapter(settings=settings)
