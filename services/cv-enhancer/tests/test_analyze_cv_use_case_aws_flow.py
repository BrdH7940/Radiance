from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.domain.analysis_job import AnalysisJob, JobStatus, RedFlag
from core.domain.cv_resume_schema import CVResumeSchema, PersonalInfo
from core.use_cases.analyze_cv_use_case import AnalyzeCVUseCase
from domain.models import SkillGap


def _settings():
    return SimpleNamespace(s3_enhanced_prefix="enhanced-pdf/")


def _queued_job() -> AnalysisJob:
    now = datetime.now(timezone.utc)
    return AnalysisJob(
        id="job-1",
        status=JobStatus.QUEUED,
        s3_key="raw-pdf/cv.pdf",
        jd_text="JD text",
        created_at=now,
        updated_at=now,
    )


def _analysis_output():
    return SimpleNamespace(
        matching_score=85,
        missing_skills=[SkillGap(skill="AWS", importance="critical")],
        red_flags=[RedFlag(title="Gap", description="2 years", severity="medium")],
        enhanced_cv_json=CVResumeSchema(
            personal_info=PersonalInfo(name="Alice", email="alice@example.com")
        ),
    )


@pytest.mark.asyncio
async def test_execute_runs_aws_related_flow_successfully():
    storage = MagicMock()
    storage.generate_presigned_download_url.return_value = "https://signed-download"
    parser = AsyncMock()
    parser.parse_pdf.return_value = "parsed cv text"
    llm = AsyncMock()
    llm.analyze_and_enhance.return_value = _analysis_output()
    repo = AsyncMock()
    repo.get.return_value = _queued_job()
    pdf_renderer = MagicMock()
    pdf_renderer.render_to_pdf.return_value = "/tmp/output/resume.pdf"

    use_case = AnalyzeCVUseCase(
        storage=storage,
        parser=parser,
        llm=llm,
        job_repo=repo,
        pdf_renderer=pdf_renderer,
        settings=_settings(),
    )

    await use_case.execute(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    storage.download_object.assert_called_once()
    storage.upload_file.assert_called_once()
    upload_kwargs = storage.upload_file.call_args.kwargs
    assert upload_kwargs["local_path"] == "/tmp/output/resume.pdf"
    assert upload_kwargs["content_type"] == "application/pdf"
    assert upload_kwargs["object_key"].startswith("enhanced-pdf/")
    assert upload_kwargs["object_key"].endswith("_enhanced_cv.pdf")

    storage.generate_presigned_download_url.assert_called_once()
    repo.update.assert_called()
    final_job = repo.update.call_args_list[-1].args[0]
    assert final_job.status == JobStatus.COMPLETED
    assert final_job.result is not None
    assert final_job.result.pdf_url == "https://signed-download"


@pytest.mark.asyncio
async def test_execute_marks_failed_when_storage_download_fails():
    storage = MagicMock()
    storage.download_object.side_effect = RuntimeError("S3 unavailable")
    parser = AsyncMock()
    llm = AsyncMock()
    repo = AsyncMock()
    repo.get.side_effect = [_queued_job(), _queued_job()]
    pdf_renderer = MagicMock()

    use_case = AnalyzeCVUseCase(
        storage=storage,
        parser=parser,
        llm=llm,
        job_repo=repo,
        pdf_renderer=pdf_renderer,
        settings=_settings(),
    )

    await use_case.execute(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    failed_job = repo.update.call_args_list[-1].args[0]
    assert failed_job.status == JobStatus.FAILED
    assert failed_job.error == "S3 unavailable"


@pytest.mark.asyncio
async def test_execute_returns_when_job_not_found():
    storage = MagicMock()
    parser = AsyncMock()
    llm = AsyncMock()
    repo = AsyncMock()
    repo.get.return_value = None
    pdf_renderer = MagicMock()

    use_case = AnalyzeCVUseCase(
        storage=storage,
        parser=parser,
        llm=llm,
        job_repo=repo,
        pdf_renderer=pdf_renderer,
        settings=_settings(),
    )

    await use_case.execute(job_id="missing", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    repo.update.assert_not_called()
    storage.download_object.assert_not_called()
