"""
Prompt templates for the two-node CV analysis pipeline (Analyzer → Enhancer).

Design decisions
----------------
* Prompts are stored as module-level constants so they can be imported without
  side-effects and are visible to version control diffs.
* Placeholders use Python str.format() / LangChain template syntax: {variable}.
* Keep prompts here — never inline them inside graph node functions.

Version history
---------------
v1.0 — Initial prompts covering score, gaps, red-flags, and STAR enhancement.
"""

# ---------------------------------------------------------------------------
# Node 1 — Analyzer
# Produces: matching_score, missing_skills, red_flags
# ---------------------------------------------------------------------------

ANALYZER_SYSTEM_PROMPT: str = (
    "You are a senior ATS consultant and technical recruiter with 15+ years of experience "
    "evaluating engineering candidates at FAANG-level companies. "
    "Your analysis is objective, data-driven, and ruthlessly actionable. "
    "You identify not only skill gaps but also the structural red flags that experienced "
    "recruiters notice immediately and that cost candidates interviews."
)

ANALYZER_HUMAN_PROMPT: str = """\
## Candidate CV
{cv_text}

## Job Description
{jd_text}

## Your Task
Perform a rigorous, structured evaluation of the CV against the Job Description.

### 1. Matching Score (0–100)
Score overall ATS fit using these weights:
- Technical skills & technology stack overlap → 40 %
- Years and depth of directly relevant experience → 30 %
- Domain / industry alignment → 20 %
- Education, certifications & required qualifications → 10 %

### 2. Missing Skills
List every concrete skill, technology, methodology, or qualification that the JD requires
but is absent or insufficient in the CV. Be specific ("Kubernetes", not "containers").
Classify each gap:
- `critical`    → Deal-breaker; the candidate will fail technical screening without it.
- `recommended` → Strongly preferred; its absence significantly weakens the application.
- `nice-to-have` → Beneficial but the candidate can still succeed without it.

### 3. Red Flags
Identify structural or content issues that experienced recruiters immediately flag:
- Unexplained employment gaps (> 3 months).
- Job-hopping (multiple roles < 1 year without contract/freelance context).
- Vague bullets with zero quantified results.
- Mismatch between claimed seniority level and depth of described experience.
- Buzzword-heavy skills section with no demonstrated evidence of use.
- Outdated technology stack for the target role.
- Missing or very thin sections (e.g. no professional summary, no education).

For each red flag provide:
- A short `title` (e.g. "Unquantified Impact", "Employment Gap Jan–Sep 2022").
- A `description` explaining the concern from a recruiter's perspective.
- A `severity`: "high" (likely immediate rejection), "medium" (notable concern), "low" (minor polish issue).\
"""

# ---------------------------------------------------------------------------
# Node 2 — Enhancer
# Produces: CVResumeSchema (structured JSON)
# ---------------------------------------------------------------------------

ENHANCER_SYSTEM_PROMPT: str = (
    "You are an elite technical resume writer specialising in ATS optimisation and the STAR "
    "methodology. You transform ordinary CVs into compelling, metric-rich structured data that "
    "passes automated ATS filters and impresses senior hiring managers at top tech companies. "
    "You write precisely, avoid fluff, and every claim you make is grounded in the original CV. "
    "You output ONLY structured JSON — no Markdown, no LaTeX, no plain text explanation."
)

ENHANCER_HUMAN_PROMPT: str = """\
## Original CV
{cv_text}

## Target Job Description
{jd_text}

## Identified Skill Gaps to Address
{missing_skills_text}

## Red Flags to Fix
{red_flags_text}

## Rewriting Instructions

### personal_info (PRESERVE EXACTLY)
- Copy the candidate's name, email, phone, location, and links verbatim from the original CV.
- Do NOT invent, alter, or omit any contact detail.

### summary
- Write exactly 3 sentences:
  1. Role title + total years of experience + core specialisation area.
  2. Two or three key technical strengths most aligned with the target JD (use JD keywords).

### experiences (highest priority — STAR method)
- List all positions from the original CV in reverse chronological order.
- For each position, rewrite every bullet using the STAR method (Situation → Task → Action → Result).
- Begin each bullet with a strong past-tense action verb (Architected, Spearheaded, Reduced, Automated, Scaled, Shipped, Delivered, Optimised, Engineered, Led).
- Quantify every result: percentages, latency/throughput numbers, team size, cost savings ($), revenue impact, uptime figures.
- Weave in keywords and technologies from the Job Description naturally.
- Eliminate all fluff: "responsible for", "helped with", "worked on", "participated in".
- Each bullet: a single dense sentence of 20–35 words.
- Preserve company names, role titles, and date ranges exactly from the original CV.

### education
- Copy all education entries from the original CV in reverse chronological order.
- institution, degree, major, start_date, end_date, location, gpa: PRESERVE EXACTLY from the original — do NOT invent any field.
- honors: include only Dean's List, Valedictorian, scholarships, or similar academic distinctions stated in the original CV; leave empty otherwise.

### projects
- Include projects that are relevant to the target JD. Skip unrelated or trivial projects.
- name, role, tech_stack, start_date, end_date, link: preserve from original CV.
- description: rewrite as STAR-style bullets — problem, solution, measurable outcome. Action verb first.
- tech_stack: list the key technologies actually used (do NOT pad with JD keywords not in the original).

### skill_groups
- Group skills into meaningful categories (e.g. Programming Languages, Cloud & DevOps, Databases, Frameworks, Tools).
- Re-order to place the most JD-relevant skills first within each group and first among groups.
- Where skill gaps exist and evidence is present in the CV, surface that evidence in experience bullets.
- Remove unsupported buzz-word skills that have no backing in the experience section.

### awards_certifications
- Copy all awards, scholarships, honours, and professional certifications from the original CV.
- title: full official name, e.g. 'AWS Certified Solutions Architect – Associate'.
- link: preserve verification URL if present in the original; otherwise null.
- Do NOT fabricate certifications.

### Addressing Red Flags
- Employment gaps: add a brief, honest context phrase in the relevant experience bullet if appropriate.
- Vague bullets: transform with STAR method — do NOT fabricate specific numbers; use ranges or qualitative improvements if needed.

Output the complete, submission-ready CV as a structured JSON object matching the provided schema.
All sections must be fully populated. Do not truncate, summarise, or omit any section.\
"""
