from unittest.mock import AsyncMock, MagicMock

import pytest

from infrastructure.adapters.gemini_llm_adapter import GeminiLLMAdapter


@pytest.mark.asyncio
async def test_analyze_and_enhance_maps_graph_output_to_domain(monkeypatch):
    llm_ctor = MagicMock(return_value=MagicMock())
    monkeypatch.setattr(
        "infrastructure.adapters.gemini_llm_adapter.ChatGoogleGenerativeAI",
        llm_ctor,
    )

    graph_mock = MagicMock()
    graph_mock.ainvoke = AsyncMock(
        return_value={
            "matching_score": 91,
            "missing_skills": [{"skill": "AWS Lambda", "importance": "critical"}],
            "red_flags": [
                {"title": "No metrics", "description": "Needs quantified impact", "severity": "medium"}
            ],
            "enhanced_cv_json": {
                "personal_info": {"name": "Alice", "email": "alice@example.com"},
                "summary": None,
                "experiences": [],
                "education": [],
                "projects": [],
                "skill_groups": [],
                "awards_certifications": [],
            },
        }
    )
    monkeypatch.setattr(
        GeminiLLMAdapter,
        "_build_graph",
        MagicMock(return_value=graph_mock),
    )

    adapter = GeminiLLMAdapter(api_key="fake-key", model="gemini-1.5-flash")
    result = await adapter.analyze_and_enhance("cv content", "jd content")

    assert result.matching_score == 91
    assert len(result.missing_skills) == 1
    assert result.missing_skills[0].skill == "AWS Lambda"
    assert len(result.red_flags) == 1
    assert result.enhanced_cv_json.personal_info.name == "Alice"

    graph_mock.ainvoke.assert_awaited_once_with(
        {"cv_text": "cv content", "jd_text": "jd content"}
    )
