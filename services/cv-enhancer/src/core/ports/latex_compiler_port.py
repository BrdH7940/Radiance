"""
ILaTeXCompilerService — abstract port for converting a Markdown CV into a
Jinja2-templated LaTeX document and compiling it to a PDF.
"""

from abc import ABC, abstractmethod


class ILaTeXCompilerService(ABC):
    """Port for the two-stage Markdown → LaTeX → PDF compilation pipeline."""

    @abstractmethod
    def markdown_to_latex(self, markdown_content: str) -> str:
        """Convert a Markdown-formatted CV body into a complete LaTeX document.

        Internally this function:
        1. Converts Markdown elements (headings, bullets, bold, etc.) to LaTeX.
        2. Injects the converted body into a Jinja2-managed ``resume_template.tex``.

        Args:
            markdown_content: The full STAR-enhanced CV in Markdown.

        Returns:
            A complete, compilable LaTeX document string (including preamble
            and ``\\begin{document}`` / ``\\end{document}`` wrapper).
        """
        ...

    @abstractmethod
    def compile_to_pdf(self, latex_code: str, output_dir: str) -> str:
        """Compile a LaTeX document string to a PDF file on disk.

        Args:
            latex_code: Full LaTeX source to compile.
            output_dir: Directory where the output PDF (and build artefacts)
                        will be written.

        Returns:
            Absolute path to the compiled ``.pdf`` file.

        Raises:
            RuntimeError: If ``pdflatex`` exits with a non-zero return code.
            FileNotFoundError: If ``pdflatex`` is not installed on the system.
        """
        ...
