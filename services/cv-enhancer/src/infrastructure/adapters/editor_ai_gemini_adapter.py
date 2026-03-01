"""
Gemini-backed implementation of IEditorAIService for LaTeX snippet refinement.

The system prompt instructs the model to return ONLY valid LaTeX syntax
with no markdown code blocks or explanatory text. Response is stripped of
common markdown wrappers as a safety measure.
"""

import logging
import re

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from core.ports.editor_ai_port import IEditorAIService

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a LaTeX expert. You rewrite LaTeX snippets only.

RULES:
- Output ONLY the refined LaTeX fragment. No explanations, no markdown, no code fences.
- Do NOT wrap the output in ```latex or ``` or any other formatting.
- Preserve LaTeX commands (\\textbf, \\item, \\textit, etc.) and add new ones as needed.
- Keep the output concise and directly usable inside a LaTeX document.
- If the user asks for STAR format, rewrite the bullet using Situation, Task, Action, Result in one LaTeX line.
- If the user asks for metrics/numbers, add plausible quantified results in LaTeX.
- Return nothing but the LaTeX string."""


class EditorAIGeminiAdapter(IEditorAIService):
    """Gemini 1.5 Flash adapter for editor refinements."""

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.3,
            max_retries=2,
        )
        logger.info("EditorAIGeminiAdapter initialised with model '%s'.", model)

    async def refine(self, selected_text: str, prompt: str) -> str:
        """Refine the LaTeX snippet; return only valid LaTeX."""
        user_content = (
            f"Selected LaTeX to refine:\n{selected_text}\n\n"
            f"User instruction: {prompt}\n\n"
            "Output only the refined LaTeX (no markdown, no code blocks):"
        )
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]
        response = await self._llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)
        if not isinstance(raw, str):
            raw = str(raw)
        return _strip_markdown_latex(raw)


def _strip_markdown_latex(text: str) -> str:
    """Remove markdown code fences and trim so only LaTeX remains."""
    t = text.strip()
    # Remove ```latex ... ``` or ``` ... ```
    for pattern in [
        r"^```\s*latex\s*\n?(.*?)\n?```\s*$",
        r"^```\s*\n?(.*?)\n?```\s*$",
    ]:
        m = re.search(pattern, t, re.DOTALL | re.IGNORECASE)
        if m:
            t = m.group(1).strip()
    return t.strip()
