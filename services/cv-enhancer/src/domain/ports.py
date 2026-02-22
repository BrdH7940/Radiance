"""
Abstract interfaces for the CV Enhancer service.
"""

from abc import ABC, abstractmethod
from domain.models import AnalysisReport


class IDocumentParser(ABC):
    """Interface for parsing documents into plain text."""

    @abstractmethod
    async def parse_pdf(self, file_path: str) -> str:
        """Parse a PDF file and return its content as Markdown or plain text.

        Args:
            file_path: The local filesystem path to the PDF file.

        Returns:
            Extracted text content as a string (Markdown preferred).

        Raises:
            FileNotFoundError: If no file exists at the given path.
            ValueError: If the file cannot be processed as a PDF.
        """
        ...


class ICVEnhancerAgent(ABC):
    """Interface for the AI"""

    @abstractmethod
    async def analyze_and_enhance(self, cv_text: str, jd_text: str) -> AnalysisReport:
        """Analyse a CV against a Job Description and produce an enhanced version.

        Args:
            cv_text: Parsed CV content (Markdown or plain text).
            jd_text: Full text of the target Job Description.

        Returns:
            An AnalysisReport with the matching score, skill gaps, and enhanced CV.
        """
        ...
