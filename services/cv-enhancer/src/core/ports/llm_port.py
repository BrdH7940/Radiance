"""
ILLMService — abstract port for the AI-powered CV analysis and enhancement pipeline.

This port decouples the AnalyzeCVUseCase from any specific LLM provider or
orchestration framework (LangGraph, LangChain, raw HTTP, etc.).
"""

from abc import ABC, abstractmethod
from typing import List

from pydantic import BaseModel, Field

from core.domain.analysis_job import RedFlag
from core.domain.cv_resume_schema import CVResumeSchema
from core.domain.gallery_schemas import ClientAIResult, ProjectItem
from core.domain.skill_gap import SkillGap


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
    enhanced_cv_json: CVResumeSchema = Field(
        description=(
            "Complete, STAR-rewritten CV as structured JSON. "
            "Ready to be rendered to HTML and compiled to PDF via WeasyPrint."
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
        """Analyse a CV against a JD and produce an enhanced structured version.

        Args:
            cv_text: Parsed CV content in Markdown or plain text.
            jd_text: Full text of the Job Description.

        Returns:
            FullAnalysisOutput containing the score, gaps, red flags,
            and the STAR-enhanced CV as a validated CVResumeSchema.

        Raises:
            Exception: Any LLM provider error propagates to the caller,
                       which is responsible for updating the job status to FAILED.
        """
        ...

    @abstractmethod
    async def enhance_from_gallery(
        self,
        cv_text: str,
        jd_text: str,
        verified_projects: List[ProjectItem],
    ) -> CVResumeSchema:
        """Produce a strategically enhanced CV using pre-verified gallery projects.

        Uses the STRATEGIC_ENHANCER_PROMPT which instructs the model to:
        - Preserve personal_info and education verbatim.
        - Filter irrelevant experience (summarise or omit).
        - Inject verified_projects into the Projects section using STAR format.
        - If verified_projects is empty, populate recommended_actions instead
          of hallucinating project content.

        Args:
            cv_text:            Extracted plain text of the candidate's CV.
            jd_text:            Full job description text.
            verified_projects:  Source-of-truth projects from Supabase (already validated).

        Returns:
            CVResumeSchema with an enhanced CV. When verified_projects is empty,
            the recommended_actions field will be populated instead of projects.
        """
        ...

    @abstractmethod
    async def rank_projects_for_jd(
        self,
        jd_text: str,
        projects: List[ProjectItem],
    ) -> List[ClientAIResult]:
        """Rank and reason about projects against a JD (server-side fallback).

        Performs the same task as the browser WebWorker but using Gemini.
        Returns up to 5 ranked projects sorted by fit_score descending.

        Args:
            jd_text:   Full job description text.
            projects:  The user's complete project gallery.

        Returns:
            Up to 5 ClientAIResult objects, sorted by fit_score descending.
        """
        ...
