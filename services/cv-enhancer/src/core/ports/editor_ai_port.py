"""
IEditorAIService — abstract port for AI-powered plain-text CV field refinement.

Used by the workspace editor: the user selects a text snippet from a CV field
(e.g. a bullet point, summary sentence, or skill description) and provides a
natural-language prompt; the service returns a rewritten plain-text snippet only
(no Markdown, no LaTeX, no code fences). The editor replaces the field value inline.
"""

from abc import ABC, abstractmethod


class IEditorAIService(ABC):
    """Port for refining a selected plain-text CV snippet according to a user prompt."""

    @abstractmethod
    async def refine(self, selected_text: str, prompt: str) -> str:
        """Rewrite the given text snippet according to the user's instruction.

        Args:
            selected_text: The plain-text fragment to refine (e.g. a bullet point).
            prompt: Natural-language instruction (e.g. "Make it STAR format").

        Returns:
            The refined plain-text snippet only. Must be directly usable as
            a CV field value. No Markdown, no LaTeX, no surrounding explanation.
        """
        ...
