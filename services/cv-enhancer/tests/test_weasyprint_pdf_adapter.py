"""Tests for WeasyPrintPDFAdapter (infrastructure.adapters.weasyprint_pdf_adapter).

WeasyPrint itself is mocked so the test suite can run without system-level
dependencies (Pango, Cairo, etc.).  The Jinja2 template layer is also replaced
by an in-memory loader so we never need a real cv_template.html on disk.

Note: `HTML` is a deferred import inside `render_to_pdf` (not a module-level
attribute), so we inject a fake `weasyprint` module via `sys.modules` rather
than using `patch` on the attribute directly.
"""

import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.domain.cv_resume_schema import CVResumeSchema, PersonalInfo
from infrastructure.adapters.weasyprint_pdf_adapter import WeasyPrintPDFAdapter


def _minimal_cv() -> CVResumeSchema:
    return CVResumeSchema(personal_info=PersonalInfo(name="Alice", email="alice@example.com"))


def _make_adapter(tmp_path: Path) -> WeasyPrintPDFAdapter:
    """Create an adapter with a real template dir containing a trivial template."""
    template_dir = tmp_path / "templates"
    template_dir.mkdir()
    (template_dir / "cv_template.html").write_text(
        "<html><body>{{ cv.personal_info.name }}</body></html>"
    )
    return WeasyPrintPDFAdapter(template_dir=str(template_dir))


def _mock_weasyprint(html_cls: MagicMock) -> types.ModuleType:
    """Build a fake `weasyprint` module whose `HTML` attribute is `html_cls`."""
    mod = types.ModuleType("weasyprint")
    mod.HTML = html_cls
    return mod


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_render_to_pdf_returns_pdf_path(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "out")

    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF-fake"
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    result = adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)

    assert result == str(tmp_path / "out" / "resume.pdf")


def test_render_to_pdf_writes_bytes_to_disk(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "out")

    fake_pdf_bytes = b"%PDF-1.4 fake content"
    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = fake_pdf_bytes
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    result = adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)

    assert Path(result).read_bytes() == fake_pdf_bytes


def test_render_to_pdf_creates_output_dir_if_missing(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "nested" / "out")

    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF"
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)

    assert Path(output_dir).is_dir()


def test_render_to_pdf_passes_html_string_to_weasyprint(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "out")

    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF"
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)

    call_kwargs = mock_html_cls.call_args
    assert "string" in call_kwargs.kwargs
    assert "Alice" in call_kwargs.kwargs["string"]


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------

def test_render_to_pdf_raises_runtime_error_on_weasyprint_failure(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "out")

    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.side_effect = Exception("Cairo missing")
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    with pytest.raises(RuntimeError, match="WeasyPrint PDF generation failed"):
        adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)


def test_render_to_pdf_raises_runtime_error_when_weasyprint_not_installed(tmp_path, monkeypatch):
    adapter = _make_adapter(tmp_path)
    output_dir = str(tmp_path / "out")

    monkeypatch.setitem(sys.modules, "weasyprint", None)
    with pytest.raises(RuntimeError, match="WeasyPrint is not installed"):
        adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=output_dir)


def test_render_to_pdf_raises_runtime_error_on_template_error(tmp_path, monkeypatch):
    """A broken template (undefined variable) must raise RuntimeError, not TemplateSyntaxError."""
    template_dir = tmp_path / "templates"
    template_dir.mkdir()
    (template_dir / "cv_template.html").write_text("{{ undefined_var }}")

    adapter = WeasyPrintPDFAdapter(template_dir=str(template_dir))

    mock_html_instance = MagicMock()
    mock_html_instance.write_pdf.return_value = b"%PDF"
    mock_html_cls = MagicMock(return_value=mock_html_instance)

    monkeypatch.setitem(sys.modules, "weasyprint", _mock_weasyprint(mock_html_cls))
    with pytest.raises(RuntimeError, match="Jinja2 template rendering failed"):
        adapter.render_to_pdf(cv_data=_minimal_cv(), output_dir=str(tmp_path / "out"))
