"""
Gemini-backed implementation of IEditorAIService for plain-text CV field refinement.

The system prompt instructs the model to return ONLY the refined plain text
with no Markdown, no LaTeX, and no explanatory text. Response is stripped of
common formatting artefacts as a safety measure.
"""

import logging
import re

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

from core.ports.editor_ai_port import IEditorAIService

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a professional resume writer. You refine individual CV text snippets only.

RULES:
- Output ONLY the refined text. No explanations, no Markdown formatting, no LaTeX, no code fences.
- Keep the tone professional, results-oriented, and concise.
- If the user asks for STAR format, rewrite the snippet using Situation → Task → Action → Result in a single sentence.
- If the user asks for metrics or numbers, add plausible quantified results (percentages, dollar amounts, user counts, time savings).
- Use strong past-tense action verbs (Architected, Automated, Delivered, Engineered, Led, Optimised, Reduced, Scaled, Shipped, Spearheaded).
- Return only the rewritten text string. Nothing else."""


class EditorAIGeminiAdapter(IEditorAIService):
    """Gemini 1.5 Flash adapter for plain-text CV field refinements."""

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=0.3,
            max_retries=2,
        )
        logger.info("EditorAIGeminiAdapter initialised with model '%s'.", model)

    async def refine(self, selected_text: str, prompt: str) -> str:
        """Refine the text snippet; return only the improved plain text."""
        user_content = (
            f"CV text to refine:\n{selected_text}\n\n"
            f"User instruction: {prompt}\n\n"
            "Output only the refined text (no explanations, no formatting markers):"
        )
        messages = [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ]
        response = await self._llm.ainvoke(messages)
        raw = response.content if hasattr(response, "content") else str(response)
        if not isinstance(raw, str):
            raw = str(raw)
        return _strip_formatting(raw)


def _strip_formatting(text: str) -> str:
    """Remove any markdown/code-fence wrappers that the model may have added."""
    t = text.strip()
    for pattern in [
        r"^```\s*\w*\s*\n?(.*?)\n?```\s*$",
        r"^\*\*(.*?)\*\*$",
    ]:
        m = re.search(pattern, t, re.DOTALL | re.IGNORECASE)
        if m:
            t = m.group(1).strip()
    return t.strip()
