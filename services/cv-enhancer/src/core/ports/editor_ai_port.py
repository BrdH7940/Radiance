"""
IEditorAIService — abstract port for AI-powered LaTeX snippet refinement.

Used by the workspace editor: user selects a LaTeX fragment and provides a
natural-language prompt; the service returns a rewritten LaTeX snippet only
(no markdown, no code fences). The editor replaces the selection inline.
"""

from abc import ABC, abstractmethod


class IEditorAIService(ABC):
    """Port for refining a selected LaTeX snippet according to a user prompt."""

    @abstractmethod
    async def refine(self, selected_text: str, prompt: str) -> str:
        """Rewrite the given LaTeX snippet according to the user's instruction.

        Args:
            selected_text: The raw LaTeX fragment to refine (e.g. a bullet point).
            prompt: Natural-language instruction (e.g. "Make it STAR format").

        Returns:
            The refined LaTeX snippet only. Must be valid LaTeX that can be
            pasted back into the document. No markdown code blocks or
            surrounding explanation.
        """
        ...
