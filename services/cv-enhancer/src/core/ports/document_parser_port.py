"""
IDocumentParser — abstract port for parsing documents into plain text.
"""

from abc import ABC, abstractmethod


class IDocumentParser(ABC):
    """Interface for parsing documents into plain text.

    Example implementations: PDFPlumberParser, PyMuPDFParser, etc.
    """

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
