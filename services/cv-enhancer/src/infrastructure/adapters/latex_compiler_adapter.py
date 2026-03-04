"""
Local pdflatex implementation of ILaTeXCompilerService.

Responsibilities
----------------
1. Convert a Markdown-formatted CV body into LaTeX syntax via a custom,
   resume-aware mapper (no external pandoc dependency required).
2. Inject the converted body into the Jinja2-managed ``resume_template.tex``.
3. Compile the resulting ``.tex`` file to PDF using the system ``pdflatex`` binary.
"""

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from core.ports.latex_compiler_port import ILaTeXCompilerService

logger = logging.getLogger(__name__)

# Jinja2 uses << >> delimiters to avoid clashing with LaTeX {{ }} braces.
_JINJA_ENV_KWARGS = {
    "variable_start_string": "<<",
    "variable_end_string": ">>",
    "block_start_string": "<%",
    "block_end_string": "%>",
    "comment_start_string": "<#",
    "comment_end_string": "#>",
    "undefined": StrictUndefined,
}

_TEMPLATE_NAME = "resume_template.tex"


# ---------------------------------------------------------------------------
# Markdown → LaTeX converter (resume-focused, no external dependencies)
# ---------------------------------------------------------------------------


def _escape_latex(text: str) -> str:
    """Escape all 10 LaTeX special characters in a plain-text fragment.

    Called on text content *before* inline markdown transformations so that
    the escaping does not interfere with the markdown syntax being parsed.

    Order matters:
    1. Backslash first — avoids double-escaping subsequent replacements.
    2. Curly braces next — before replacements that introduce them (e.g. \\textasciicircum{}).
    3. Remaining special chars in any order.
    """
    text = text.replace("\\", r"\textbackslash{}")
    text = text.replace("{", r"\{")
    text = text.replace("}", r"\}")
    text = text.replace("&", r"\&")
    text = text.replace("%", r"\%")
    text = text.replace("$", r"\$")
    text = text.replace("#", r"\#")
    text = text.replace("_", r"\_")
    text = text.replace("^", r"\textasciicircum{}")
    text = text.replace("~", r"\textasciitilde{}")
    return text


def _inline_to_latex(text: str) -> str:
    """Convert inline Markdown syntax to LaTeX equivalents."""
    # Bold: **text** or __text__
    text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    text = re.sub(r"__(.+?)__", r"\\textbf{\1}", text)
    # Italic: *text* (single asterisk only)
    text = re.sub(r"\*([^*]+?)\*", r"\\textit{\1}", text)
    # Inline code: `code`
    text = re.sub(r"`(.+?)`", r"\\texttt{\1}", text)
    # Hyperlinks: [label](url)
    text = re.sub(r"\[(.+?)\]\((.+?)\)", r"\\href{\2}{\1}", text)
    # Email addresses as mailto links (bare emails in contact lines)
    text = re.sub(
        r"(?<![{\\])\b([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b",
        r"\\href{mailto:\1}{\1}",
        text,
    )
    return text


def _process_inline(raw: str) -> str:
    """Escape LaTeX special chars then apply inline Markdown transformations."""
    return _inline_to_latex(_escape_latex(raw))


def _markdown_to_latex_body(markdown: str) -> str:
    """Convert a Markdown CV document into a LaTeX body fragment.

    Handles:
    - H1 → centred large bold name header
    - H2 → ruled section heading
    - H3 → bold subsection (role/company lines)
    - Unordered lists (``- item``) → ``itemize`` environments
    - ``*italic*`` and ``_italic_`` (single) context lines (date ranges, etc.)
    - ``**bold**`` → ``\\textbf``
    - Plain paragraph lines
    - Blank lines as paragraph separators
    """
    lines = markdown.split("\n")
    output: List[str] = []
    in_itemize = False

    for raw_line in lines:
        stripped = raw_line.strip()

        # Close open itemize when we leave the list context
        if in_itemize and stripped and not stripped.startswith("- "):
            output.append(r"\end{itemize}")
            in_itemize = False

        # ── H1: candidate name ───────────────────────────────────────────
        if stripped.startswith("# "):
            content = _process_inline(stripped[2:])
            output.append(
                r"\begin{center}"
                rf"\LARGE\textbf{{{content}}}"
                r"\end{center}"
                r"\vspace{2pt}"
            )

        # ── H2: section headers ──────────────────────────────────────────
        elif stripped.startswith("## "):
            content = _process_inline(stripped[3:])
            output.append(rf"\section*{{{content}}}")

        # ── H3: role / company sub-headers ───────────────────────────────
        elif stripped.startswith("### "):
            content = _process_inline(stripped[4:])
            output.append(rf"\subsection*{{{content}}}")

        # ── Bullet list item ─────────────────────────────────────────────
        elif stripped.startswith("- "):
            if not in_itemize:
                # Use a plain itemize environment that works with base LaTeX
                # without requiring the enumitem package.
                output.append(r"\begin{itemize}")
                in_itemize = True
            content = _process_inline(stripped[2:])
            output.append(rf"  \item {content}")

        # ── Blank line ───────────────────────────────────────────────────
        elif stripped == "":
            if in_itemize:
                output.append(r"\end{itemize}")
                in_itemize = False
            output.append("")

        # ── Plain paragraph line ─────────────────────────────────────────
        else:
            content = _process_inline(stripped)
            output.append(content)

    # Ensure any trailing list is closed
    if in_itemize:
        output.append(r"\end{itemize}")

    return "\n".join(output)


# ---------------------------------------------------------------------------
# Adapter implementation
# ---------------------------------------------------------------------------


class LocalLaTeXCompiler(ILaTeXCompilerService):
    """Compiles Markdown CVs to PDF using Jinja2 templating + system pdflatex."""

    def __init__(self, template_dir: str) -> None:
        """Initialise the compiler with the directory containing LaTeX templates.

        Args:
            template_dir: Absolute path to the directory holding ``resume_template.tex``.
        """
        self._env = Environment(
            loader=FileSystemLoader(template_dir),
            **_JINJA_ENV_KWARGS,
        )
        logger.info(
            "LocalLaTeXCompiler initialised — template dir: '%s'.", template_dir
        )

    def markdown_to_latex(self, markdown_content: str) -> str:
        """Convert a Markdown CV body into a full LaTeX document via Jinja2.

        Args:
            markdown_content: STAR-enhanced CV in Markdown.

        Returns:
            Complete, compilable LaTeX document string.
        """
        body = _markdown_to_latex_body(markdown_content)
        template = self._env.get_template(_TEMPLATE_NAME)
        latex_doc: str = template.render(body=body)
        logger.debug(
            "markdown_to_latex: produced %d characters of LaTeX.", len(latex_doc)
        )
        return latex_doc

    def compile_to_pdf(self, latex_code: str, output_dir: str) -> str:
        """Write LaTeX to a temp file and compile with pdflatex.

        Args:
            latex_code: Full LaTeX document source.
            output_dir: Directory where the final PDF will be placed.

        Returns:
            Absolute path to the compiled PDF.

        Raises:
            FileNotFoundError: If ``pdflatex`` is not installed.
            RuntimeError: If pdflatex returns a non-zero exit code.
        """
        pdflatex_path = shutil.which("pdflatex")
        if not pdflatex_path:
            raise FileNotFoundError(
                "pdflatex not found on PATH. "
                "Install TeX Live (e.g. 'apt install texlive-latex-base') "
                "or MiKTeX and ensure it is on the system PATH."
            )

        # Use a temporary working directory for compilation artefacts.
        with tempfile.TemporaryDirectory(prefix="radiance_latex_") as build_dir:
            tex_path = Path(build_dir) / "resume.tex"
            tex_path.write_text(latex_code, encoding="utf-8")

            # Run pdflatex twice: first pass builds the PDF, second pass resolves
            # cross-references (e.g. hyperlinks). -interaction=nonstopmode prevents
            # the process from halting on non-fatal warnings.
            for pass_num in (1, 2):
                result = subprocess.run(
                    [
                        pdflatex_path,
                        "-interaction=nonstopmode",
                        "-output-directory",
                        build_dir,
                        str(tex_path),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if result.returncode != 0:
                    logger.error(
                        "pdflatex pass %d failed (exit %d).\nSTDOUT:\n%s\nSTDERR:\n%s",
                        pass_num,
                        result.returncode,
                        result.stdout[-2000:],
                        result.stderr[-500:],
                    )
                    raise RuntimeError(
                        f"pdflatex compilation failed (pass {pass_num}, "
                        f"exit code {result.returncode}). "
                        "Check server logs for the full pdflatex output."
                    )

            compiled_pdf = Path(build_dir) / "resume.pdf"
            if not compiled_pdf.exists():
                raise RuntimeError(
                    "pdflatex exited 0 but 'resume.pdf' was not produced."
                )

            # Move the PDF out of the temporary directory before it is deleted.
            os.makedirs(output_dir, exist_ok=True)
            dest = Path(output_dir) / "resume.pdf"
            shutil.copy2(str(compiled_pdf), str(dest))
            logger.info("PDF compiled successfully → '%s'.", dest)
            return str(dest)
