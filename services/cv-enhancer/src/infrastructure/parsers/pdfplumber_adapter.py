"""
pdfplumber PDF parser.
"""

import asyncio
import logging
from functools import partial
from pathlib import Path

import pdfplumber

from core.ports.document_parser_port import IDocumentParser

logger = logging.getLogger(__name__)


class PDFPlumberParser(IDocumentParser):
    """Lightweight PDF parser backed by pdfplumber."""

    async def parse_pdf(self, file_path: str) -> str:
        """Parse a PDF and return its content as plain text.

        Text from each page is joined with double newlines. Tables are
        rendered as tab-separated rows so structural information is preserved.

        Args:
            file_path: Absolute or relative path to the PDF file.

        Returns:
            Plain-text string of the full document content.

        Raises:
            FileNotFoundError: If the file does not exist at ``file_path``.
            ValueError: If pdfplumber extracts empty content (corrupt /
                image-only / password-protected file).
        """
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(
                f"CV file not found at path: '{file_path}'. "
                "Ensure the file was downloaded from S3 before calling this service."
            )
        if not path.is_file():
            raise ValueError(f"Path is not a regular file: '{file_path}'.")

        logger.info("PDFPlumberParser: parsing '%s'.", file_path)

        loop = asyncio.get_running_loop()
        parse_fn = partial(self._extract_text, str(path))
        text: str = await loop.run_in_executor(None, parse_fn)

        if not text.strip():
            raise ValueError(
                f"pdfplumber extracted empty content from '{file_path}'. "
                "The file may be corrupted, image-only, or password-protected."
            )

        logger.info(
            "PDFPlumberParser: extracted %d characters from '%s'.",
            len(text),
            file_path,
        )
        return text

    @staticmethod
    def _extract_text(file_path: str) -> str:
        """Synchronous extraction — runs in a thread-pool executor."""
        pages: list[str] = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                pages.append(page_text)
        return "\n\n".join(pages)
