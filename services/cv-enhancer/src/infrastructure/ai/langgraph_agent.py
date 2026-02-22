"""
This is a 2-step LangGraph Pipeline:
    1. Analyzer node: Compares the CV with the JD.
    2. Enhancer node: Rewrites the CV experience section using the STAR method.
"""

import logging
from typing import List, Optional, TypedDict

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from domain.models import AnalysisReport, EnhancedCV, SkillGap
from domain.ports import ICVEnhancerAgent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LangGraph State
# ---------------------------------------------------------------------------


class CVEnhancerState(TypedDict, total=False):
    """Shared mutable state flowing through the LangGraph pipeline."""

    cv_text: str
    jd_text: str
    matching_score: int
    missing_skills: List[dict]  # serialised SkillGap dicts for JSON compatibility
    enhanced_cv_content: str


# ---------------------------------------------------------------------------
# Structured Output Schemas
# ---------------------------------------------------------------------------


class _AnalyzerOutput(BaseModel):
    """Schema for Gemini's structured response from the Analyzer node."""

    matching_score: int = Field(
        ge=0,
        le=100,
        description=(
            "Overall match score (0–100). "
            "Weight: technical skills 40%, experience level 30%, "
            "domain/industry fit 20%, education & certifications 10%."
        ),
    )
    missing_skills: List[SkillGap] = Field(
        description=(
            "Concrete skills, tools, or qualifications that the JD requires "
            "but are absent or insufficient in the CV. "
            "Include only actionable, specific gaps."
        )
    )


class _EnhancerOutput(BaseModel):
    """Schema for Gemini's structured response from the Enhancer node."""

    enhanced_cv_content: str = Field(
        description=(
            "The complete, polished CV in clean Markdown format. "
            "Every experience bullet point must follow the STAR method "
            "(Situation → Task → Action → Result) with quantifiable metrics. "
            "ATS keywords from the JD are naturally woven in. "
            "All sections (contact, summary, skills, education) are preserved."
        )
    )


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_ANALYZER_SYSTEM = (
    "You are a senior ATS consultant and technical recruiter with 15+ years of experience "
    "evaluating engineering candidates. Your analysis is objective, precise, and actionable."
)

_ANALYZER_HUMAN = """\
## Candidate CV
{cv_text}

## Job Description
{jd_text}

## Your Task
Perform a rigorous gap analysis between the CV and the Job Description.

**Matching Score (0–100)** — Evaluate overall fit using these weights:
- Technical skills & technology overlap → 40 %
- Years and depth of relevant experience → 30 %
- Domain / industry alignment → 20 %
- Education, certifications & qualifications → 10 %

**Missing Skills** — List every concrete skill, technology, methodology, or
qualification that the JD requires but is absent or weak in the CV.
Classify each gap:
- `critical`      → A deal-breaker; the candidate cannot do the job without it.
- `recommended`   → Strongly preferred; its absence significantly weakens the application.
- `nice-to-have`  → Beneficial but not required for the role.

Avoid vague soft-skill gaps. Be specific (e.g. "Kubernetes" not "container knowledge").\
"""

_ENHANCER_SYSTEM = (
    "You are an elite technical resume writer specialising in ATS optimisation and "
    "the STAR methodology. You transform ordinary CVs into compelling narratives that "
    "pass ATS filters and impress hiring managers at top tech companies."
)

_ENHANCER_HUMAN = """\
## Original CV
{cv_text}

## Target Job Description
{jd_text}

## Identified Skill Gaps to Address
{missing_skills_text}

## Rewriting Instructions

### Experience Section (most important)
- Apply the **STAR method** to every bullet: Situation → Task → Action → Result.
- Begin each bullet with a strong past-tense action verb
  (e.g. Architected, Spearheaded, Reduced, Automated, Scaled, Delivered).
- **Quantify every result** where possible: percentages, latency/throughput numbers,
  team size, cost savings, revenue impact, time-to-market improvement.
- Naturally incorporate keywords and technologies from the Job Description.
- **Eliminate fluff**: remove phrases like "responsible for", "helped with",
  "worked on", "assisted in", "participated in".
- Each bullet should be a single, dense sentence (target 20–35 words).

### Professional Summary
- Write or rewrite a 3-sentence summary at the top, tailored to the JD.
- Sentence 1: Role + years of experience + core specialisation.
- Sentence 2: Key technical strengths relevant to the JD.
- Sentence 3: A quantified career highlight.

### Skills Section
- Re-order and expand skills to highlight technologies mentioned in the JD first.

### Unchanged Sections
- Contact information, education, and certifications must remain exactly as-is.

Output the **complete, submission-ready CV** in clean Markdown.\
"""


# ---------------------------------------------------------------------------
# Concrete Implementation
# ---------------------------------------------------------------------------


class LangGraphCVEnhancer(ICVEnhancerAgent):
    """
    CV analysis and enhancement agent powered by LangGraph and Gemini 1.5 Flash.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-1.5-flash",
    ) -> None:
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.2,
            max_retries=3,
        )
        self._graph = self._build_graph()
        logger.info("LangGraphCVEnhancer initialised with model '%s'.", model)

    def _build_graph(self):
        """Compile the two-node StateGraph pipeline."""
        llm = self._llm

        # Build structured LLM chains once; reuse across requests
        analyzer_chain = ChatPromptTemplate.from_messages(
            [("system", _ANALYZER_SYSTEM), ("human", _ANALYZER_HUMAN)]
        ) | llm.with_structured_output(_AnalyzerOutput)

        enhancer_chain = ChatPromptTemplate.from_messages(
            [("system", _ENHANCER_SYSTEM), ("human", _ENHANCER_HUMAN)]
        ) | llm.with_structured_output(_EnhancerOutput)

        # ------------------------------------------------------------------
        # Node 1 — Analyzer
        # ------------------------------------------------------------------
        async def analyzer_node(state: CVEnhancerState) -> dict:
            """Compare CV with JD to produce a match score and skill gap list."""
            logger.info("LangGraph ▶ Analyzer node: invoking Gemini.")

            result: _AnalyzerOutput = await analyzer_chain.ainvoke(
                {"cv_text": state["cv_text"], "jd_text": state["jd_text"]}
            )

            logger.info(
                "LangGraph ✓ Analyzer — score: %d, gaps: %d.",
                result.matching_score,
                len(result.missing_skills),
            )
            return {
                "matching_score": result.matching_score,
                "missing_skills": [gap.model_dump() for gap in result.missing_skills],
            }

        # ------------------------------------------------------------------
        # Node 2 — Enhancer
        # ------------------------------------------------------------------
        async def enhancer_node(state: CVEnhancerState) -> dict:
            """Rewrite the CV using STAR method, tailored to the JD and gaps."""
            logger.info("LangGraph ▶ Enhancer node: invoking Gemini.")

            missing_skills: List[dict] = state.get("missing_skills", [])
            if missing_skills:
                missing_skills_text = "\n".join(
                    f"- [{gap['importance'].upper()}] {gap['skill']}"
                    for gap in missing_skills
                )
            else:
                missing_skills_text = (
                    "No specific gaps identified — focus on general STAR enhancement."
                )

            result: _EnhancerOutput = await enhancer_chain.ainvoke(
                {
                    "cv_text": state["cv_text"],
                    "jd_text": state["jd_text"],
                    "missing_skills_text": missing_skills_text,
                }
            )

            logger.info(
                "LangGraph ✓ Enhancer — produced %d characters.",
                len(result.enhanced_cv_content),
            )
            return {"enhanced_cv_content": result.enhanced_cv_content}

        # Graph wiring
        graph = StateGraph(CVEnhancerState)
        graph.add_node("analyzer", analyzer_node)
        graph.add_node("enhancer", enhancer_node)
        graph.set_entry_point("analyzer")
        graph.add_edge("analyzer", "enhancer")
        graph.add_edge("enhancer", END)

        return graph.compile()

    async def analyze_and_enhance(self, cv_text: str, jd_text: str) -> AnalysisReport:
        """Run the full LangGraph pipeline.

        Args:
            cv_text: Parsed CV content (Markdown or plain text).
            jd_text: Full job description text.

        Returns:
            AnalysisReport populated with the score, gaps, and enhanced CV.

        Raises:
            Exception: Any Gemini API or LangGraph execution error propagates up.
        """
        logger.info("LangGraphCVEnhancer: starting pipeline.")

        initial_state: CVEnhancerState = {
            "cv_text": cv_text,
            "jd_text": jd_text,
        }

        final_state: CVEnhancerState = await self._graph.ainvoke(initial_state)

        logger.info("LangGraphCVEnhancer: pipeline complete.")

        return AnalysisReport(
            matching_score=final_state["matching_score"],
            missing_skills=[SkillGap(**gap) for gap in final_state["missing_skills"]],
            enhanced_cv=EnhancedCV(content=final_state["enhanced_cv_content"]),
        )
