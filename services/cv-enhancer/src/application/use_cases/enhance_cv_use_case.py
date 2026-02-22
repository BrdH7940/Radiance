"""
Use Case: Enhance a CV against a Job Description.
"""

import logging

from domain.ports import IDocumentParser, ICVEnhancerAgent
from application.dtos import EnhanceCVRequestDTO, EnhanceCVResponseDTO, SkillGapDTO

logger = logging.getLogger(__name__)


class EnhanceCVUseCase:
    """Orchestrates the CV enhancement workflow:

    1. Parse — Extract text from the CV PDF via the document parser port.
    2. Analyse & Enhance — Delegate to the AI agent port which returns an
       AnalysisReport (matching score, skill gaps, STAR-rewritten CV).
    3. Map — Convert the domain report into the response DTO for the API.

    All concrete implementations are injected
    """

    def __init__(
        self,
        parser: IDocumentParser,
        agent: ICVEnhancerAgent,
    ) -> None:
        """Initialise with injected port implementations.

        Args:
            parser: Concrete adapter implementing IDocumentParser.
            agent:  Concrete adapter implementing ICVEnhancerAgent.
        """
        self._parser = parser
        self._agent = agent

    async def execute(self, request: EnhanceCVRequestDTO) -> EnhanceCVResponseDTO:
        """Execute the full CV enhancement pipeline.

        Args:
            request: Validated input DTO containing the CV path and JD text.

        Returns:
            EnhanceCVResponseDTO with the matching score, skill gaps, and
            the STAR-enhanced CV content in Markdown format.

        Raises:
            FileNotFoundError: Propagated from the parser if the CV file is missing.
            ValueError: Propagated from the parser if the file is not a valid PDF.
            Exception: Any unhandled AI-layer error is propagated to the caller.
        """
        logger.info("EnhanceCVUseCase.execute — CV path: '%s'", request.cv_file_path)

        # 1. Parse the PDF into text
        cv_text: str = await self._parser.parse_pdf(request.cv_file_path)
        logger.info("CV parsed successfully — %d characters extracted.", len(cv_text))

        # 2. AI analysis and enhancement
        report = await self._agent.analyze_and_enhance(cv_text, request.jd_text)
        logger.info(
            "Analysis complete — score: %d, gaps identified: %d.",
            report.matching_score,
            len(report.missing_skills),
        )

        # 3. Map domain model into response DTO
        return EnhanceCVResponseDTO(
            matching_score=report.matching_score,
            missing_skills=[
                SkillGapDTO(skill=gap.skill, importance=gap.importance)
                for gap in report.missing_skills
            ],
            enhanced_cv_content=report.enhanced_cv.content,
        )
