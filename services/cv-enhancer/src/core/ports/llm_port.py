"""
ILLMService — abstract port for the AI-powered CV analysis and enhancement pipeline.

This port decouples the AnalyzeCVUseCase from any specific LLM provider or
orchestration framework (LangGraph, LangChain, raw HTTP, etc.).
"""

from abc import ABC, abstractmethod
from typing import List

from pydantic import BaseModel, Field

from core.domain.analysis_job import RedFlag
from domain.models import SkillGap


class FullAnalysisOutput(BaseModel):
    """Structured output produced by the LLM pipeline.

    This is the single data contract between ILLMService and the use case.
    Every field is required — the adapter must ensure completeness.
    """

    matching_score: int = Field(
        ge=0,
        le=100,
        description="ATS fit score (0–100) based on technical overlap, experience, domain fit, and education.",
    )
    missing_skills: List[SkillGap] = Field(
        description="Skills required by the JD that are absent or insufficient in the CV."
    )
    red_flags: List[RedFlag] = Field(
        description="Structural or content concerns a recruiter would immediately notice."
    )
    enhanced_cv_markdown: str = Field(
        description=(
            "Complete, STAR-rewritten CV in clean Markdown. "
            "Ready to be converted to LaTeX and compiled to PDF."
        )
    )


class ILLMService(ABC):
    """Port for AI-driven CV analysis and enhancement."""

    @abstractmethod
    async def analyze_and_enhance(
        self,
        cv_text: str,
        jd_text: str,
    ) -> FullAnalysisOutput:
        """Analyse a CV against a JD and produce an enhanced version.

        Args:
            cv_text: Parsed CV content in Markdown or plain text.
            jd_text: Full text of the Job Description.

        Returns:
            FullAnalysisOutput containing the score, gaps, red flags,
            and the STAR-enhanced CV in Markdown.

        Raises:
            Exception: Any LLM provider error propagates to the caller,
                       which is responsible for updating the job status to FAILED.
        """
        ...
