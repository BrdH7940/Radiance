"""
FallbackLLMAdapter — transparent primary/fallback wrapper for ILLMService.

Tries the primary adapter first. If it raises any exception (e.g. Gemini 429
Resource Exhausted, 503 Service Unavailable, timeout), logs a warning and
immediately retries the same call on the fallback adapter.

If the fallback also fails, its exception propagates to the caller (use case),
which marks the job as FAILED — same behaviour as when there is no fallback.

Usage in container.py:
    FallbackLLMAdapter(
        primary=GeminiLLMAdapter(...),
        fallback=GroqLLMAdapter(...),
    )
"""

import logging
from typing import List

from core.domain.cv_resume_schema import CVResumeSchema
from core.domain.gallery_schemas import ClientAIResult, ProjectItem
from core.ports.llm_port import FullAnalysisOutput, ILLMService

logger = logging.getLogger(__name__)


class FallbackLLMAdapter(ILLMService):
    """Wraps a primary and a fallback ILLMService.

    Any exception from the primary triggers a transparent retry on the fallback.
    Both adapters must implement the full ILLMService contract.
    """

    def __init__(self, primary: ILLMService, fallback: ILLMService) -> None:
        self._primary = primary
        self._fallback = fallback

    async def analyze_and_enhance(self, cv_text: str, jd_text: str) -> FullAnalysisOutput:
        try:
            return await self._primary.analyze_and_enhance(cv_text, jd_text)
        except Exception as exc:
            logger.warning(
                "Primary LLM failed for analyze_and_enhance (%s: %s). "
                "Switching to fallback adapter.",
                type(exc).__name__,
                exc,
            )
            return await self._fallback.analyze_and_enhance(cv_text, jd_text)

    async def enhance_from_gallery(
        self,
        cv_text: str,
        jd_text: str,
        verified_projects: List[ProjectItem],
    ) -> CVResumeSchema:
        try:
            return await self._primary.enhance_from_gallery(cv_text, jd_text, verified_projects)
        except Exception as exc:
            logger.warning(
                "Primary LLM failed for enhance_from_gallery (%s: %s). "
                "Switching to fallback adapter.",
                type(exc).__name__,
                exc,
            )
            return await self._fallback.enhance_from_gallery(cv_text, jd_text, verified_projects)

    async def rank_projects_for_jd(
        self,
        jd_text: str,
        projects: List[ProjectItem],
    ) -> List[ClientAIResult]:
        try:
            return await self._primary.rank_projects_for_jd(jd_text, projects)
        except Exception as exc:
            logger.warning(
                "Primary LLM failed for rank_projects_for_jd (%s: %s). "
                "Switching to fallback adapter.",
                type(exc).__name__,
                exc,
            )
            return await self._fallback.rank_projects_for_jd(jd_text, projects)
