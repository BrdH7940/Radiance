"""
IPDFRenderService — abstract port for rendering a structured CVResumeSchema to PDF.

Replaces ILaTeXCompilerService. Implementations convert CVResumeSchema → HTML (Jinja2)
→ PDF bytes (WeasyPrint) and write the result to disk.
"""

from abc import ABC, abstractmethod

from core.domain.cv_resume_schema import CVResumeSchema


class IPDFRenderService(ABC):
    """Port for rendering a structured CV to a PDF file."""

    @abstractmethod
    def render_to_pdf(self, cv_data: CVResumeSchema, output_dir: str) -> str:
        """Render a CVResumeSchema to a PDF file on disk.

        Args:
            cv_data: Validated structured CV data.
            output_dir: Directory where the resulting PDF will be written.
                        Created automatically if it does not exist.

        Returns:
            Absolute path to the generated PDF file (``output_dir/resume.pdf``).

        Raises:
            RuntimeError: If PDF generation fails for any reason.
        """
        ...
