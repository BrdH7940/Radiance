"""
Unit tests for PDFPlumberParser.

All tests use tmp_path and either a real minimal PDF (created via reportlab or
fpdf2 if available) or a mock of pdfplumber.open so the suite runs without any
external files.
"""

import io
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from infrastructure.parsers.pdfplumber_adapter import PDFPlumberParser


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_pdf(pages_text: list[str]) -> MagicMock:
    """Return a mock pdfplumber PDF context manager with the given page texts."""
    mock_pages = []
    for text in pages_text:
        page = MagicMock()
        page.extract_text.return_value = text
        mock_pages.append(page)

    mock_pdf = MagicMock()
    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
    mock_pdf.__exit__ = MagicMock(return_value=False)
    mock_pdf.pages = mock_pages
    return mock_pdf


# ---------------------------------------------------------------------------
# FileNotFoundError / ValueError for bad paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_pdf_raises_file_not_found_for_missing_file(tmp_path):
    parser = PDFPlumberParser()
    missing = str(tmp_path / "nonexistent.pdf")
    with pytest.raises(FileNotFoundError, match="CV file not found"):
        await parser.parse_pdf(missing)


@pytest.mark.asyncio
async def test_parse_pdf_raises_value_error_for_directory(tmp_path):
    parser = PDFPlumberParser()
    with pytest.raises(ValueError, match="not a regular file"):
        await parser.parse_pdf(str(tmp_path))


# ---------------------------------------------------------------------------
# Successful extraction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_pdf_returns_joined_page_text(tmp_path):
    pdf_file = tmp_path / "cv.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake")  # file must exist for path checks

    mock_pdf = _make_mock_pdf(["Page one content", "Page two content"])

    parser = PDFPlumberParser()
    with patch("infrastructure.parsers.pdfplumber_adapter.pdfplumber.open", return_value=mock_pdf):
        result = await parser.parse_pdf(str(pdf_file))

    assert result == "Page one content\n\nPage two content"


@pytest.mark.asyncio
async def test_parse_pdf_skips_none_page_text(tmp_path):
    """Pages where extract_text returns None are treated as empty strings."""
    pdf_file = tmp_path / "cv.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake")

    mock_pdf = _make_mock_pdf([None, "Real content", None])

    parser = PDFPlumberParser()
    with patch("infrastructure.parsers.pdfplumber_adapter.pdfplumber.open", return_value=mock_pdf):
        result = await parser.parse_pdf(str(pdf_file))

    assert "Real content" in result


@pytest.mark.asyncio
async def test_parse_pdf_single_page(tmp_path):
    pdf_file = tmp_path / "cv.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake")

    mock_pdf = _make_mock_pdf(["Only page"])

    parser = PDFPlumberParser()
    with patch("infrastructure.parsers.pdfplumber_adapter.pdfplumber.open", return_value=mock_pdf):
        result = await parser.parse_pdf(str(pdf_file))

    assert result == "Only page"


# ---------------------------------------------------------------------------
# Empty content → ValueError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_pdf_raises_value_error_when_all_pages_empty(tmp_path):
    pdf_file = tmp_path / "cv.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake")

    mock_pdf = _make_mock_pdf(["", "   ", None])

    parser = PDFPlumberParser()
    with patch("infrastructure.parsers.pdfplumber_adapter.pdfplumber.open", return_value=mock_pdf):
        with pytest.raises(ValueError, match="empty content"):
            await parser.parse_pdf(str(pdf_file))


# ---------------------------------------------------------------------------
# extract_text tolerance args are forwarded
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_parse_pdf_calls_extract_text_with_tolerances(tmp_path):
    pdf_file = tmp_path / "cv.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake")

    mock_pdf = _make_mock_pdf(["Some text"])

    parser = PDFPlumberParser()
    with patch("infrastructure.parsers.pdfplumber_adapter.pdfplumber.open", return_value=mock_pdf):
        await parser.parse_pdf(str(pdf_file))

    mock_pdf.pages[0].extract_text.assert_called_once_with(x_tolerance=3, y_tolerance=3)
