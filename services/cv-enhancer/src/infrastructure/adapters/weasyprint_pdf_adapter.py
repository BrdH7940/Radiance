"""
WeasyPrint implementation of IPDFRenderService.

Renders a CVResumeSchema to a PDF file by:
  1. Loading the Jinja2 HTML template (cv_template.html).
  2. Rendering the template with the CV data dict.
  3. Converting the HTML string to PDF bytes via WeasyPrint.
  4. Writing the PDF to disk inside the caller-supplied output directory.
"""

import logging
import os
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from core.domain.cv_resume_schema import CVResumeSchema
from core.ports.pdf_render_port import IPDFRenderService

logger = logging.getLogger(__name__)

_TEMPLATE_NAME = "cv_template.html"


class WeasyPrintPDFAdapter(IPDFRenderService):
    """Renders CVResumeSchema → HTML (Jinja2) → PDF (WeasyPrint)."""

    def __init__(self, template_dir: str) -> None:
        self._env = Environment(
            loader=FileSystemLoader(template_dir),
            undefined=StrictUndefined,
            autoescape=True,
        )
        logger.info(
            "WeasyPrintPDFAdapter initialised — template dir: '%s'.", template_dir
        )

    def render_to_pdf(self, cv_data: CVResumeSchema, output_dir: str) -> str:
        """Render CV data to a PDF file using WeasyPrint.

        Args:
            cv_data: Validated structured CV data.
            output_dir: Directory where ``resume.pdf`` will be written.

        Returns:
            Absolute path to the generated PDF file.

        Raises:
            RuntimeError: If Jinja2 rendering or WeasyPrint conversion fails.
        """
        try:
            from weasyprint import HTML  # deferred import so startup doesn't fail if not installed
        except ImportError as exc:
            raise RuntimeError(
                "WeasyPrint is not installed. Add 'weasyprint' to requirements.txt "
                "and install its system dependencies."
            ) from exc

        try:
            template = self._env.get_template(_TEMPLATE_NAME)
            html_string = template.render(cv=cv_data.model_dump(mode="json"))
            logger.debug(
                "WeasyPrintPDFAdapter: rendered HTML template (%d chars).", len(html_string)
            )
        except Exception as exc:
            raise RuntimeError(f"Jinja2 template rendering failed: {exc}") from exc

        try:
            pdf_bytes: bytes = HTML(string=html_string).write_pdf()
            logger.debug(
                "WeasyPrintPDFAdapter: PDF generated (%d bytes).", len(pdf_bytes)
            )
        except Exception as exc:
            raise RuntimeError(f"WeasyPrint PDF generation failed: {exc}") from exc

        os.makedirs(output_dir, exist_ok=True)
        dest = Path(output_dir) / "resume.pdf"
        dest.write_bytes(pdf_bytes)
        logger.info("WeasyPrintPDFAdapter: PDF written → '%s'.", dest)
        return str(dest)
