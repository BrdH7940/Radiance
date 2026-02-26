"""
Use Case: Analyse and enhance a CV asynchronously.

This class is the sole orchestrator of the 8-step background pipeline.
It depends only on ports (interfaces) — never on concrete adapters or cloud SDKs.

Pipeline steps
--------------
1.  Mark job as PROCESSING in the repository.
2.  Download the raw CV PDF from storage (S3) to a local /tmp directory.
3.  Parse the PDF to Markdown/plain text via the document parser port.
4.  Run the LLM analysis: produces score, gaps, red_flags, and enhanced Markdown.
5.  Convert enhanced Markdown to a full LaTeX document via the LaTeX compiler port.
6.  Compile the LaTeX document to PDF (pdflatex).
7.  Upload the compiled PDF to storage under the enhanced-pdf/ prefix.
8.  Generate a presigned download URL and persist the completed result to the repository.

Any exception in steps 2–8 marks the job as FAILED with a structured error message
so that the background task never fails silently.
"""

import logging
import os
import tempfile
from datetime import datetime
from uuid import uuid4

from config import AppSettings
from core.domain.analysis_job import AnalysisJob, AnalysisResult, JobStatus
from core.ports.job_repository_port import IJobRepository
from core.ports.latex_compiler_port import ILaTeXCompilerService
from core.ports.llm_port import ILLMService
from domain.ports import IDocumentParser, IStorageService

logger = logging.getLogger(__name__)


class AnalyzeCVUseCase:
    """Orchestrates the full async CV analysis and enhancement pipeline.

    All dependencies are injected as port interfaces, keeping this class
    completely decoupled from infrastructure implementations.
    """

    def __init__(
        self,
        storage: IStorageService,
        parser: IDocumentParser,
        llm: ILLMService,
        job_repo: IJobRepository,
        latex_compiler: ILaTeXCompilerService,
        settings: AppSettings,
    ) -> None:
        self._storage = storage
        self._parser = parser
        self._llm = llm
        self._job_repo = job_repo
        self._latex_compiler = latex_compiler
        self._settings = settings

    async def execute(self, job_id: str, s3_key: str, jd_text: str) -> None:
        """Run the pipeline for a given job.

        This method is designed to be called as a FastAPI BackgroundTask.
        It never raises — all exceptions are caught and stored in the job record.

        Args:
            job_id: Unique ID of the previously created AnalysisJob.
            s3_key: S3 object key of the raw CV PDF.
            jd_text: Job description text.
        """
        logger.info("AnalyzeCVUseCase: starting pipeline for job '%s'.", job_id)

        # ── Step 1: Mark PROCESSING ──────────────────────────────────────────
        try:
            job = await self._job_repo.get(job_id)
            if job is None:
                logger.error(
                    "Pipeline aborted: job '%s' not found in repository.", job_id
                )
                return

            await self._job_repo.update(
                job.model_copy(
                    update={
                        "status": JobStatus.PROCESSING,
                        "updated_at": datetime.utcnow(),
                    }
                )
            )
        except Exception as exc:
            logger.error(
                "Failed to mark job '%s' as PROCESSING: %s", job_id, exc, exc_info=True
            )
            return

        # ── Steps 2–8: Pipeline (any failure → FAILED) ──────────────────────
        with tempfile.TemporaryDirectory(prefix="radiance_cv_") as work_dir:
            try:
                # Step 2 — Download PDF from S3
                local_pdf_path = os.path.join(work_dir, "cv.pdf")
                logger.info("Step 2: Downloading '%s' → '%s'.", s3_key, local_pdf_path)
                self._storage.download_object(
                    object_key=s3_key,
                    local_path=local_pdf_path,
                )

                # Step 3 — Parse PDF to text
                logger.info("Step 3: Parsing PDF with Docling.")
                cv_text: str = await self._parser.parse_pdf(local_pdf_path)
                logger.info(
                    "Step 3 ✓ Extracted %d characters from CV.", len(cv_text)
                )

                # Step 4 — LLM analysis + enhancement
                logger.info("Step 4: Running LLM pipeline (Gemini).")
                analysis = await self._llm.analyze_and_enhance(
                    cv_text=cv_text, jd_text=jd_text
                )
                logger.info(
                    "Step 4 ✓ Score: %d, gaps: %d, red flags: %d.",
                    analysis.matching_score,
                    len(analysis.missing_skills),
                    len(analysis.red_flags),
                )

                # Step 5 — Markdown → LaTeX
                logger.info("Step 5: Converting Markdown CV to LaTeX via Jinja2.")
                latex_code: str = self._latex_compiler.markdown_to_latex(
                    analysis.enhanced_cv_markdown
                )
                logger.info("Step 5 ✓ LaTeX document: %d chars.", len(latex_code))

                # Step 6 — Compile LaTeX → PDF
                logger.info("Step 6: Compiling LaTeX with pdflatex.")
                pdf_output_dir = os.path.join(work_dir, "pdf_output")
                local_pdf_out: str = self._latex_compiler.compile_to_pdf(
                    latex_code=latex_code, output_dir=pdf_output_dir
                )
                logger.info("Step 6 ✓ PDF compiled → '%s'.", local_pdf_out)

                # Step 7 — Upload enhanced PDF to S3
                s3_pdf_key = (
                    f"{self._settings.s3_enhanced_prefix}"
                    f"{uuid4().hex}_enhanced_cv.pdf"
                )
                logger.info("Step 7: Uploading PDF to S3 key '%s'.", s3_pdf_key)
                self._storage.upload_file(
                    local_path=local_pdf_out,
                    object_key=s3_pdf_key,
                    content_type="application/pdf",
                )

                # Step 8 — Generate presigned download URL + persist result
                logger.info("Step 8: Generating presigned download URL.")
                pdf_url: str = self._storage.generate_presigned_download_url(s3_pdf_key)

                result = AnalysisResult(
                    matching_score=analysis.matching_score,
                    missing_skills=analysis.missing_skills,
                    red_flags=analysis.red_flags,
                    latex_code=latex_code,
                    pdf_url=pdf_url,
                )

                updated_job = AnalysisJob(
                    id=job_id,
                    status=JobStatus.COMPLETED,
                    s3_key=s3_key,
                    jd_text=jd_text,
                    created_at=job.created_at,
                    updated_at=datetime.utcnow(),
                    result=result,
                )
                await self._job_repo.update(updated_job)
                logger.info(
                    "AnalyzeCVUseCase: job '%s' completed successfully.", job_id
                )

            except Exception as exc:
                logger.error(
                    "AnalyzeCVUseCase: pipeline failed for job '%s': %s",
                    job_id,
                    exc,
                    exc_info=True,
                )
                await self._mark_failed(job_id, s3_key, jd_text, str(exc))

    async def _mark_failed(
        self, job_id: str, s3_key: str, jd_text: str, error_message: str
    ) -> None:
        """Persist a FAILED status for the given job without raising."""
        try:
            existing = await self._job_repo.get(job_id)
            failed_job = AnalysisJob(
                id=job_id,
                status=JobStatus.FAILED,
                s3_key=s3_key,
                jd_text=jd_text,
                created_at=existing.created_at if existing else datetime.utcnow(),
                updated_at=datetime.utcnow(),
                error=error_message,
            )
            await self._job_repo.update(failed_job)
            logger.info("Job '%s' marked as FAILED.", job_id)
        except Exception as repo_exc:
            # Last resort — log but do not re-raise; the BG task must not crash.
            logger.critical(
                "Could not persist FAILED status for job '%s': %s",
                job_id,
                repo_exc,
                exc_info=True,
            )
