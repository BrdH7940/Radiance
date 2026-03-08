"""
Structured CV/resume data schema — the single data contract between LLM output,
job storage, frontend rendering, and PDF generation.

Replaces the LaTeX/Markdown intermediate format. The LLM Enhancer produces a
validated CVResumeSchema instance which is:
  1. Stored as JSON inside AnalysisResult (replaces latex_code).
  2. Sent to the frontend as enhanced_cv_json in the polling response.
  3. Rendered to PDF server-side via Jinja2 HTML → WeasyPrint.
  4. Used by the frontend form-builder for real-time A4 HTML preview.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class Link(BaseModel):
    """A professional profile or portfolio link."""

    label: str = Field(
        description="Human-readable label shown in the CV, e.g. 'LinkedIn', 'GitHub', 'Portfolio'."
    )
    url: str = Field(description="Full URL including the https:// scheme.")


class PersonalInfo(BaseModel):
    """Candidate contact and identification details."""

    name: str = Field(description="Candidate's full legal name as it should appear on the CV.")
    email: str = Field(description="Primary professional email address.")
    phone: Optional[str] = Field(
        default=None,
        description="Phone number in international format, e.g. '+1 555-123-4567'. Preserve exactly from the original CV.",
    )
    location: Optional[str] = Field(
        default=None,
        description="City and country/state, e.g. 'San Francisco, CA' or 'London, UK'.",
    )
    links: List[Link] = Field(
        default_factory=list,
        description="Professional links: LinkedIn, GitHub, personal site, etc. Preserve URLs exactly from the original CV.",
    )


class Summary(BaseModel):
    """Three-sentence executive professional summary."""

    text: str = Field(
        description=(
            "Exactly three sentences: "
            "(1) Role title + total years of experience + core specialisation. "
            "(2) Two or three key technical strengths most relevant to the target JD. "
            "(3) One powerful, quantified career highlight (numbers required)."
        )
    )


class Experience(BaseModel):
    """A single professional role or position."""

    company: str = Field(description="Full company or organisation name.")
    role: str = Field(description="Exact job title / position held.")
    date_range: str = Field(
        description="Employment period, e.g. 'Jan 2020 – Dec 2022' or 'Mar 2023 – Present'."
    )
    bullets: List[str] = Field(
        default_factory=list,
        description=(
            "STAR-formatted achievement bullets. Each bullet must: "
            "start with a strong past-tense action verb, "
            "contain a quantified result (%, $, x, ms, users), "
            "be a single dense sentence of 20–35 words."
        ),
    )


class Education(BaseModel):
    """A formal education entry (university, bootcamp, certification programme, etc.)."""

    institution: str = Field(description="Full name of the university, school, or issuing organisation.")
    degree: str = Field(
        description="Degree level or credential type, e.g. 'Bachelor of Science', 'Master of Engineering', 'Professional Certificate'."
    )
    major: str = Field(
        description="Field of study or specialisation, e.g. 'Computer Science', 'Electrical Engineering'."
    )
    start_date: str = Field(description="Start date, e.g. 'Sep 2018' or '2018'.")
    end_date: str = Field(description="End date or 'Present', e.g. 'May 2022' or '2022'.")
    location: Optional[str] = Field(
        default=None,
        description="City and country/state of the institution, e.g. 'Cambridge, MA'. Preserve from original CV.",
    )
    gpa: Optional[str] = Field(
        default=None,
        description="GPA or grade if stated in the original CV, e.g. '3.8/4.0' or '8.5/10'. Do NOT invent.",
    )
    honors: List[str] = Field(
        default_factory=list,
        description="Academic honours, awards, or highly relevant coursework, e.g. \"Dean's List\", 'Valedictorian'.",
    )


class Project(BaseModel):
    """A personal, academic, or open-source project."""

    name: str = Field(description="Project name.")
    role: str = Field(
        description="Candidate's role in the project, e.g. 'Backend Developer', 'Project Lead', 'Solo Developer'."
    )
    tech_stack: List[str] = Field(
        description="Key technologies, languages, and frameworks used, e.g. ['Python', 'FastAPI', 'PostgreSQL', 'Docker']."
    )
    start_date: str = Field(description="Project start date, e.g. 'Jan 2023' or '2023'.")
    end_date: str = Field(description="End date or 'Present'.")
    link: Optional[str] = Field(
        default=None,
        description="URL to the GitHub repo, live demo, case study, or any publicly verifiable artefact.",
    )
    description: List[str] = Field(
        default_factory=list,
        description=(
            "STAR-style bullet points describing the problem, solution, and measurable outcome. "
            "Each bullet: one dense sentence, action verb first, quantified result where possible."
        ),
    )


class SkillGroup(BaseModel):
    """A thematic grouping of technical or professional skills."""

    category: str = Field(
        description="Skill category name, e.g. 'Programming Languages', 'Cloud & DevOps', 'Databases', 'Frameworks'."
    )
    skills: List[str] = Field(
        description="Ordered list of specific skills (most relevant to the JD first), e.g. ['Python', 'Go', 'TypeScript']."
    )


class AwardsAndCertification(BaseModel):
    """An award, scholarship, honour, or professional certification."""

    title: str = Field(
        description="Full name of the award, scholarship, or certification, e.g. 'AWS Certified Solutions Architect – Associate'."
    )
    link: Optional[str] = Field(
        default=None,
        description="URL to the online certificate, badge, or verification page (e.g. Credly, Coursera).",
    )


class CVResumeSchema(BaseModel):
    """
    Complete structured representation of an enhanced CV.

    This is the canonical data model for the entire CV pipeline:
    LLM Enhancer → Job Storage → Frontend Form Builder → HTML Preview → PDF (WeasyPrint).
    """

    personal_info: PersonalInfo = Field(
        description="Contact details. MUST be preserved exactly from the original CV — do NOT invent or alter."
    )
    summary: Optional[Summary] = Field(
        default=None,
        description="Executive professional summary. Write fresh or rewrite to target the JD.",
    )
    experiences: List[Experience] = Field(
        default_factory=list,
        description="Professional experience entries in reverse chronological order (most recent first).",
    )
    education: List[Education] = Field(
        default_factory=list,
        description="Education entries in reverse chronological order. Preserve all details exactly from the original CV.",
    )
    projects: List[Project] = Field(
        default_factory=list,
        description="Notable personal, academic, or open-source projects. Include only those relevant to the target JD.",
    )
    skill_groups: List[SkillGroup] = Field(
        default_factory=list,
        description="Grouped skills. Reorder categories and individual skills so JD-relevant ones appear first.",
    )
    awards_certifications: List[AwardsAndCertification] = Field(
        default_factory=list,
        description="Awards, scholarships, honours, and professional certifications from the original CV.",
    )
