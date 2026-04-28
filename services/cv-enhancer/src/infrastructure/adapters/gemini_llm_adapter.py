"""
Gemini (via LangGraph) implementation of ILLMService.

Pipeline: Analyzer node → Enhancer node
- Analyzer:  produces matching_score + missing_skills + red_flags.
- Enhancer:  produces a complete CVResumeSchema (structured JSON), informed by the gap analysis.

The prompts used here are imported from core.prompts — they are never inlined.

The graph-building logic is exposed as a module-level helper (`build_llm_pipelines`)
so that `GroqLLMAdapter` and any future provider adapter can reuse the exact same
LangGraph pipeline with a different underlying `BaseChatModel`.
"""

import logging
from typing import List, TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from core.domain.analysis_job import RedFlag
from core.domain.cv_resume_schema import CVResumeSchema
from core.domain.gallery_schemas import ClientAIResult, ProjectItem
from core.domain.skill_gap import SkillGap
from core.ports.llm_port import FullAnalysisOutput, ILLMService
from core.prompts.cv_analysis_prompt import (
    ANALYZER_HUMAN_PROMPT,
    ANALYZER_SYSTEM_PROMPT,
    ENHANCER_HUMAN_PROMPT,
    ENHANCER_SYSTEM_PROMPT,
    PROJECT_RANKER_HUMAN_PROMPT,
    PROJECT_RANKER_SYSTEM_PROMPT,
    STRATEGIC_ENHANCER_HUMAN_PROMPT,
    STRATEGIC_ENHANCER_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LangGraph pipeline state
# ---------------------------------------------------------------------------


class _PipelineState(TypedDict, total=False):
    """Shared mutable state that flows through the two-node LangGraph pipeline."""

    cv_text: str
    jd_text: str
    matching_score: int
    missing_skills: List[dict]   # serialised SkillGap dicts
    red_flags: List[dict]        # serialised RedFlag dicts
    enhanced_cv_json: dict       # serialised CVResumeSchema dict


# ---------------------------------------------------------------------------
# Structured output schemas (internal, never exposed outside this module)
# ---------------------------------------------------------------------------


class _AnalyzerOutput(BaseModel):
    """Structured response from the Analyzer node."""

    matching_score: int = Field(ge=0, le=100)
    missing_skills: List[SkillGap]
    red_flags: List[RedFlag]


# ---------------------------------------------------------------------------
# Shared pipeline builder — provider-agnostic
# ---------------------------------------------------------------------------


def build_llm_pipelines(llm: BaseChatModel):
    """Compile the LangGraph Analyzer → Enhancer graph for any LangChain chat model.

    Accepts any ``BaseChatModel`` (ChatGoogleGenerativeAI, ChatGroq, etc.) and
    returns the compiled StateGraph. The model must support ``with_structured_output``,
    which all modern LangChain chat model wrappers do via tool/function calling.

    Args:
        llm: Any instantiated LangChain chat model.

    Returns:
        Compiled LangGraph ``StateGraph`` ready for ``.ainvoke()``.
    """
    analyzer_chain = (
        ChatPromptTemplate.from_messages(
            [("system", ANALYZER_SYSTEM_PROMPT), ("human", ANALYZER_HUMAN_PROMPT)]
        )
        | llm.with_structured_output(_AnalyzerOutput)
    )

    enhancer_chain = (
        ChatPromptTemplate.from_messages(
            [("system", ENHANCER_SYSTEM_PROMPT), ("human", ENHANCER_HUMAN_PROMPT)]
        )
        | llm.with_structured_output(CVResumeSchema)
    )

    # ------------------------------------------------------------------
    # Node 1 — Analyzer
    # ------------------------------------------------------------------
    async def analyzer_node(state: _PipelineState) -> dict:
        logger.info("Pipeline ▶ Analyzer: invoking LLM for score/gaps/red-flags.")

        result: _AnalyzerOutput = await analyzer_chain.ainvoke(
            {"cv_text": state["cv_text"], "jd_text": state["jd_text"]}
        )

        logger.info(
            "Pipeline ✓ Analyzer — score: %d, gaps: %d, red flags: %d.",
            result.matching_score,
            len(result.missing_skills),
            len(result.red_flags),
        )
        return {
            "matching_score": result.matching_score,
            "missing_skills": [gap.model_dump() for gap in result.missing_skills],
            "red_flags": [rf.model_dump() for rf in result.red_flags],
        }

    # ------------------------------------------------------------------
    # Node 2 — Enhancer
    # ------------------------------------------------------------------
    async def enhancer_node(state: _PipelineState) -> dict:
        logger.info("Pipeline ▶ Enhancer: invoking LLM for structured CV JSON.")

        missing_skills: List[dict] = state.get("missing_skills", [])
        red_flags: List[dict] = state.get("red_flags", [])

        missing_skills_text = (
            "\n".join(
                f"- [{g['importance'].upper()}] {g['skill']}"
                for g in missing_skills
            )
            if missing_skills
            else "No specific skill gaps identified."
        )
        red_flags_text = (
            "\n".join(
                f"- [{rf['severity'].upper()}] {rf['title']}: {rf['description']}"
                for rf in red_flags
            )
            if red_flags
            else "No structural red flags identified."
        )

        result: CVResumeSchema = await enhancer_chain.ainvoke(
            {
                "cv_text": state["cv_text"],
                "jd_text": state["jd_text"],
                "missing_skills_text": missing_skills_text,
                "red_flags_text": red_flags_text,
            }
        )

        logger.info(
            "Pipeline ✓ Enhancer — produced CV JSON for '%s' with %d experiences.",
            result.personal_info.name,
            len(result.experiences),
        )
        return {"enhanced_cv_json": result.model_dump(mode="json")}

    # ------------------------------------------------------------------
    # Graph wiring
    # ------------------------------------------------------------------
    graph = StateGraph(_PipelineState)
    graph.add_node("analyzer", analyzer_node)
    graph.add_node("enhancer", enhancer_node)
    graph.set_entry_point("analyzer")
    graph.add_edge("analyzer", "enhancer")
    graph.add_edge("enhancer", END)
    return graph.compile()


# ---------------------------------------------------------------------------
# Shared method implementations — reused by both GeminiLLMAdapter and GroqLLMAdapter
# ---------------------------------------------------------------------------


async def run_analyze_and_enhance(llm: BaseChatModel, graph, cv_text: str, jd_text: str) -> FullAnalysisOutput:
    """Execute the full Analyzer → Enhancer pipeline."""
    initial_state: _PipelineState = {"cv_text": cv_text, "jd_text": jd_text}
    final_state: _PipelineState = await graph.ainvoke(initial_state)

    return FullAnalysisOutput(
        matching_score=final_state["matching_score"],
        missing_skills=[SkillGap(**g) for g in final_state["missing_skills"]],
        red_flags=[RedFlag(**rf) for rf in final_state["red_flags"]],
        enhanced_cv_json=CVResumeSchema.model_validate(final_state["enhanced_cv_json"]),
    )


async def run_enhance_from_gallery(
    llm: BaseChatModel,
    cv_text: str,
    jd_text: str,
    verified_projects: List[ProjectItem],
) -> CVResumeSchema:
    """Strategic enhancement using verified gallery projects (single-node, no Analyzer)."""
    if verified_projects:
        projects_text = "\n\n".join(
            f"Project {i + 1}: {p.title}\n"
            f"  Description: {p.description or 'N/A'}\n"
            f"  Technologies: {', '.join(p.tech_stack)}"
            for i, p in enumerate(verified_projects)
        )
    else:
        projects_text = "EMPTY — no projects selected. Generate recommended_actions instead."

    strategic_chain = (
        ChatPromptTemplate.from_messages(
            [
                ("system", STRATEGIC_ENHANCER_SYSTEM_PROMPT),
                ("human", STRATEGIC_ENHANCER_HUMAN_PROMPT),
            ]
        )
        | llm.with_structured_output(CVResumeSchema)
    )

    logger.info(
        "Strategic enhancer: invoking LLM with %d gallery projects.",
        len(verified_projects),
    )
    result: CVResumeSchema = await strategic_chain.ainvoke(
        {
            "cv_text": cv_text,
            "jd_text": jd_text,
            "selected_projects_text": projects_text,
        }
    )
    logger.info(
        "Strategic enhancer: produced CV for '%s' (recommended_actions: %d).",
        result.personal_info.name,
        len(result.recommended_actions),
    )
    return result


async def run_rank_projects_for_jd(
    llm: BaseChatModel,
    jd_text: str,
    projects: List[ProjectItem],
) -> List[ClientAIResult]:
    """Rank projects against a JD — server-side fallback for the WebWorker."""

    class _RankerOutput(BaseModel):
        results: List[ClientAIResult]

    projects_text = "\n\n".join(
        f"Project ID: {p.id}\n"
        f"  Title: {p.title}\n"
        f"  Description: {p.description or 'N/A'}\n"
        f"  Technologies: {', '.join(p.tech_stack)}"
        for p in projects
    )

    ranker_chain = (
        ChatPromptTemplate.from_messages(
            [
                ("system", PROJECT_RANKER_SYSTEM_PROMPT),
                ("human", PROJECT_RANKER_HUMAN_PROMPT),
            ]
        )
        | llm.with_structured_output(_RankerOutput)
    )

    logger.info("Project ranker: ranking %d projects against JD.", len(projects))
    output: _RankerOutput = await ranker_chain.ainvoke(
        {"jd_text": jd_text, "projects_text": projects_text}
    )

    ranked = sorted(output.results, key=lambda r: r.fit_score, reverse=True)[:5]
    logger.info("Project ranker: returned %d results.", len(ranked))
    return ranked


# ---------------------------------------------------------------------------
# Gemini adapter
# ---------------------------------------------------------------------------


class GeminiLLMAdapter(ILLMService):
    """LangGraph + Gemini 2.5 Flash implementation of ILLMService.

    The graph compiles once at construction time and is reused across all
    requests, which avoids repeated prompt template compilation overhead.

    All pipeline logic lives in the module-level helpers above so that
    GroqLLMAdapter can share the exact same implementation.
    """

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.2,
            max_retries=3,
        )
        self._graph = build_llm_pipelines(self._llm)
        logger.info("GeminiLLMAdapter initialised with model '%s'.", model)

    async def analyze_and_enhance(self, cv_text: str, jd_text: str) -> FullAnalysisOutput:
        logger.info("GeminiLLMAdapter: starting analyze_and_enhance pipeline.")
        result = await run_analyze_and_enhance(self._llm, self._graph, cv_text, jd_text)
        logger.info("GeminiLLMAdapter: pipeline complete.")
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
