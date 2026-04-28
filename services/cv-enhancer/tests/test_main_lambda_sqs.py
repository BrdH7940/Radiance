from unittest.mock import AsyncMock, MagicMock

import pytest

import main


@pytest.mark.asyncio
async def test_process_sqs_records_calls_use_case_for_each_record(monkeypatch):
    use_case = MagicMock()
    use_case.execute = AsyncMock()
    monkeypatch.setattr("container.get_analyze_cv_use_case", MagicMock(return_value=use_case))

    event = {
        "Records": [
            {"body": '{"job_id":"job-1","s3_key":"raw-pdf/1.pdf","jd_text":"JD 1"}'},
            {"body": '{"job_id":"job-2","s3_key":"raw-pdf/2.pdf","jd_text":"JD 2"}'},
        ]
    }

    await main.process_sqs_records(event)

    assert use_case.execute.await_count == 2
    use_case.execute.assert_any_await(job_id="job-1", s3_key="raw-pdf/1.pdf", jd_text="JD 1")
    use_case.execute.assert_any_await(job_id="job-2", s3_key="raw-pdf/2.pdf", jd_text="JD 2")


def test_handler_routes_sqs_events_to_processor(monkeypatch):
    process_mock = AsyncMock(return_value=None)
    run_mock = MagicMock(return_value=None)

    monkeypatch.setattr("main.process_sqs_records", process_mock)
    monkeypatch.setattr("main.asyncio.run", run_mock)

    event = {"Records": [{"body": '{"job_id":"job-1","s3_key":"k","jd_text":"j"}'}]}
    context = MagicMock()

    main.handler(event, context)

    run_mock.assert_called_once()
    process_mock.assert_called_once_with(event)


def test_handler_routes_http_events_to_mangum(monkeypatch):
    mangum_mock = MagicMock(return_value={"statusCode": 200, "body": "ok"})
    monkeypatch.setattr("main.mangum_handler", mangum_mock)

    event = {"version": "2.0", "requestContext": {"http": {"method": "GET"}}}
    context = MagicMock()

    result = main.handler(event, context)

    assert result["statusCode"] == 200
    mangum_mock.assert_called_once_with(event, context)
