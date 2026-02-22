"""
Docling PDF parser.
"""

import asyncio
import logging
from functools import partial
from pathlib import Path

from docling.document_converter import DocumentConverter

from domain.ports import IDocumentParser

logger = logging.getLogger(__name__)


class DoclingParser(IDocumentParser):
    """Docling PDF parser."""

    def __init__(self) -> None:
        self._converter = DocumentConverter()
        logger.info("DoclingParser initialised.")

    async def parse_pdf(self, file_path: str) -> str:
        """Parse a PDF and return its content as Markdown.

        Args:
            file_path: Absolute or relative path to the PDF file.

        Returns:
            Markdown-formatted string of the full document content.

        Raises:
            FileNotFoundError: If the file does not exist at ``file_path``.
            ValueError: If Docling extracts empty content (corrupt / unsupported file).
        """
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(
                f"CV file not found at path: '{file_path}'. "
                "Ensure the file was downloaded from S3 before calling this service."
            )
        if not path.is_file():
            raise ValueError(f"Path is not a regular file: '{file_path}'.")

        logger.info("DoclingParser: converting '%s'.", file_path)

        loop = asyncio.get_event_loop()

        convert_fn = partial(self._converter.convert, str(path))
        result = await loop.run_in_executor(None, convert_fn)

        markdown_content: str = result.document.export_to_markdown()

        if not markdown_content.strip():
            raise ValueError(
                f"Docling extracted empty content from '{file_path}'. "
                "The file may be corrupted, image-only, or password-protected."
            )

        logger.info(
            "DoclingParser: extracted %d characters from '%s'.",
            len(markdown_content),
            file_path,
        )
        return markdown_content
