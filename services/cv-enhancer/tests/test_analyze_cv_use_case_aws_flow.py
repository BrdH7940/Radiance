from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from core.domain.analysis_job import AnalysisJob, JobStatus, RedFlag
from core.domain.cv_resume_schema import CVResumeSchema, PersonalInfo
from core.use_cases.analyze_cv_use_case import AnalyzeCVUseCase
from core.domain.skill_gap import SkillGap


def _settings():
    return SimpleNamespace(s3_enhanced_prefix="enhanced-pdf/")


def _queued_job(user_id: str | None = None) -> AnalysisJob:
    now = datetime.now(timezone.utc)
    return AnalysisJob(
        id="job-1",
        user_id=user_id,
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


# ---------------------------------------------------------------------------
# Step 8 — history_repo integration
# ---------------------------------------------------------------------------

def _make_use_case(*, history_repo=None, user_id=None):
    """Build a fully-mocked AnalyzeCVUseCase wired for the happy path."""
    storage = MagicMock()
    storage.generate_presigned_download_url.return_value = "https://signed-download"
    parser = AsyncMock()
    parser.parse_pdf.return_value = "parsed cv text"
    llm = AsyncMock()
    llm.analyze_and_enhance.return_value = _analysis_output()
    repo = AsyncMock()
    repo.get.return_value = _queued_job(user_id=user_id)
    pdf_renderer = MagicMock()
    pdf_renderer.render_to_pdf.return_value = "/tmp/output/resume.pdf"

    use_case = AnalyzeCVUseCase(
        storage=storage,
        parser=parser,
        llm=llm,
        job_repo=repo,
        pdf_renderer=pdf_renderer,
        settings=_settings(),
        history_repo=history_repo,
    )
    return use_case, repo


@pytest.mark.asyncio
async def test_execute_saves_history_when_user_id_set():
    """Step 8: history_repo.save is called once when job has a user_id."""
    history_repo = AsyncMock()
    USER_ID = "00000000-0000-0000-0000-000000000001"

    use_case, repo = _make_use_case(history_repo=history_repo, user_id=USER_ID)
    await use_case.execute(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    history_repo.save.assert_awaited_once()
    saved_entry = history_repo.save.call_args.args[0]
    assert str(saved_entry.user_id) == USER_ID
    assert saved_entry.matching_score == 85

    final_job = repo.update.call_args_list[-1].args[0]
    assert final_job.status == JobStatus.COMPLETED


@pytest.mark.asyncio
async def test_execute_skips_history_when_no_user_id():
    """Step 8: history_repo.save is NOT called when job has no user_id."""
    history_repo = AsyncMock()

    use_case, repo = _make_use_case(history_repo=history_repo, user_id=None)
    await use_case.execute(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    history_repo.save.assert_not_awaited()
    final_job = repo.update.call_args_list[-1].args[0]
    assert final_job.status == JobStatus.COMPLETED


@pytest.mark.asyncio
async def test_execute_still_completes_when_history_save_fails():
    """Step 8: a failing history_repo.save must NOT change the job to FAILED."""
    history_repo = AsyncMock()
    history_repo.save.side_effect = RuntimeError("Supabase down")
    USER_ID = "00000000-0000-0000-0000-000000000002"

    use_case, repo = _make_use_case(history_repo=history_repo, user_id=USER_ID)
    await use_case.execute(job_id="job-1", s3_key="raw-pdf/cv.pdf", jd_text="JD text")

    final_job = repo.update.call_args_list[-1].args[0]
    assert final_job.status == JobStatus.COMPLETED
