"""
Abstract interfaces for the CV Enhancer service.
"""

from abc import ABC, abstractmethod
from typing import Final

from domain.models import AnalysisReport


class IDocumentParser(ABC):
    """Interface for parsing documents into plain text.
    
    Example: Docling, PDFplumber, etc.
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


class ICVEnhancerAgent(ABC):
    """Interface for the CV Enhancer Agent.
    
    Example: OpenAI, Gemini, etc.
    """

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


class IStorageService(ABC):
    """Interface for object storage operations used by the CV Enhancer service.

    Example: AWS S3, GCS, etc.
    """

    @abstractmethod
    def generate_presigned_upload_url(self, object_key: str, content_type: str) -> str:
        """Generate a time-limited URL that allows the client to upload an object.

        Args:
            object_key: The fully-qualified object key inside the bucket (e.g. ``raw-pdf/uuid.pdf``).
            content_type: MIME type of the file that will be uploaded.

        Returns:
            A pre-signed HTTPS URL that can be used with HTTP PUT to upload the object.
        """
        ...


RAW_PDF_PREFIX: Final[str] = "raw-pdf/"
