"""
Groq implementation of ILLMService — used as the fallback when Gemini is unavailable.

Uses the same LangGraph pipelines as GeminiLLMAdapter (via the shared helpers in
gemini_llm_adapter.py) with ChatGroq as the underlying model.

Model: openai/gpt-oss-120b (default) — a capable reasoning model available via Groq.
"""

import logging
from typing import List

from langchain_groq import ChatGroq

from core.domain.cv_resume_schema import CVResumeSchema
from core.domain.gallery_schemas import ClientAIResult, ProjectItem
from core.ports.llm_port import FullAnalysisOutput, ILLMService
from infrastructure.adapters.gemini_llm_adapter import (
    build_llm_pipelines,
    run_analyze_and_enhance,
    run_enhance_from_gallery,
    run_rank_projects_for_jd,
)

logger = logging.getLogger(__name__)


class GroqLLMAdapter(ILLMService):
    """Groq-backed implementation of ILLMService.

    Shares all pipeline logic with GeminiLLMAdapter — only the underlying
    BaseChatModel differs (ChatGroq instead of ChatGoogleGenerativeAI).

    The graph is compiled once at construction time for efficiency.
    """

    def __init__(self, api_key: str, model: str = "openai/gpt-oss-120b") -> None:
        self._llm = ChatGroq(
            api_key=api_key,
            model=model,
            temperature=0.2,
            max_retries=2,
        )
        self._graph = build_llm_pipelines(self._llm)
        logger.info("GroqLLMAdapter initialised with model '%s'.", model)

    async def analyze_and_enhance(self, cv_text: str, jd_text: str) -> FullAnalysisOutput:
        logger.info("GroqLLMAdapter: starting analyze_and_enhance pipeline.")
        result = await run_analyze_and_enhance(self._llm, self._graph, cv_text, jd_text)
        logger.info("GroqLLMAdapter: pipeline complete.")
        return result

    async def enhance_from_gallery(
        self,
        cv_text: str,
        jd_text: str,
        verified_projects: List[ProjectItem],
    ) -> CVResumeSchema:
        return await run_enhance_from_gallery(self._llm, cv_text, jd_text, verified_projects)

    async def rank_projects_for_jd(
        self,
        jd_text: str,
        projects: List[ProjectItem],
    ) -> List[ClientAIResult]:
        return await run_rank_projects_for_jd(self._llm, jd_text, projects)
