'use client'

import {
    useState,
    useCallback,
    type ChangeEvent,
} from 'react'
import {
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    User,
    Briefcase,
    GraduationCap,
    Zap,
    AlignLeft,
    Link,
    FolderKanban,
    Award,
} from 'lucide-react'
import type { CVResumeSchema, CVExperience, CVEducation, CVProject, CVSkillGroup, CVAwardsCertification, CVLink } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CVFormBuilderProps {
    cvData: CVResumeSchema
    onChange: (updated: CVResumeSchema) => void
    /** Indices of projects injected from the Gallery (show "AI Recommended" badge). */
    aiRecommendedProjectIndices?: number[]
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionHeader({
    icon,
    title,
    expanded,
    onToggle,
    onAdd,
    addLabel,
}: {
    icon: React.ReactNode
    title: string
    expanded: boolean
    onToggle: () => void
    onAdd?: () => void
    addLabel?: string
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2.5 border-b-4 border-black bg-[#FBFBF9]">
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-2 flex-1 text-left"
            >
                <span className="text-[#1C293C]">{icon}</span>
                <span className="text-sm font-semibold text-[#1C293C]">{title}</span>
                <span className="text-[#4B5563] ml-auto">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
            </button>
            {onAdd && (
                <button
                    type="button"
                    onClick={onAdd}
                    className="flex items-center gap-1 px-2 py-1 rounded-none text-[11px] font-medium text-[#1C293C] border-4 border-black bg-[#FDC800] transition-all duration-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                >
                    <Plus className="w-3 h-3" />
                    {addLabel}
                </button>
            )}
        </div>
    )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide">{label}</label>
            {children}
        </div>
    )
}

function Input({
    value,
    onChange,
    placeholder,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    value={value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-sm placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                />
            </div>
        </div>
    )
}

function Textarea({
    value,
    onChange,
    placeholder,
    rows = 3,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    rows?: number
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-start gap-1.5">
                <textarea
                    value={value}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    className="flex-1 px-3 py-2 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-sm placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors resize-none leading-relaxed"
                />
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CVFormBuilder({ cvData, onChange, aiRecommendedProjectIndices = [] }: CVFormBuilderProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({
        personal: true,
        summary: true,
    })

    const toggle = (key: string) =>
        setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

    const update = useCallback(
        (patch: Partial<CVResumeSchema>) => onChange({ ...cvData, ...patch }),
        [cvData, onChange]
    )

    // ── Personal Info ─────────────────────────────────────────────────────────

    const updatePI = (field: string, value: string) =>
        update({ personal_info: { ...cvData.personal_info, [field]: value } })

    const updateLink = (i: number, field: keyof CVLink, value: string) => {
        const links = [...cvData.personal_info.links]
        links[i] = { ...links[i], [field]: value }
        update({ personal_info: { ...cvData.personal_info, links } })
    }
    const addLink = () =>
        update({ personal_info: { ...cvData.personal_info, links: [...cvData.personal_info.links, { label: '', url: '' }] } })
    const removeLink = (i: number) =>
        update({ personal_info: { ...cvData.personal_info, links: cvData.personal_info.links.filter((_, j) => j !== i) } })

    // ── Summary ───────────────────────────────────────────────────────────────

    const updateSummary = (text: string) =>
        update({ summary: { text } })

    // ── Experiences ───────────────────────────────────────────────────────────

    const updateExp = (i: number, patch: Partial<CVExperience>) => {
        const exps = [...cvData.experiences]
        exps[i] = { ...exps[i], ...patch }
        update({ experiences: exps })
    }
    const updateExpBullet = (ei: number, bi: number, val: string) => {
        const bullets = [...cvData.experiences[ei].bullets]
        bullets[bi] = val
        updateExp(ei, { bullets })
    }
    const addExpBullet = (ei: number) =>
        updateExp(ei, { bullets: [...cvData.experiences[ei].bullets, ''] })
    const removeExpBullet = (ei: number, bi: number) =>
        updateExp(ei, { bullets: cvData.experiences[ei].bullets.filter((_, j) => j !== bi) })
    const addExp = () =>
        update({ experiences: [...cvData.experiences, { company: '', role: '', date_range: '', bullets: [''] }] })
    const removeExp = (i: number) =>
        update({ experiences: cvData.experiences.filter((_, j) => j !== i) })

    // ── Education ─────────────────────────────────────────────────────────────

    const updateEdu = (i: number, patch: Partial<CVEducation>) => {
        const edus = [...cvData.education]
        edus[i] = { ...edus[i], ...patch }
        update({ education: edus })
    }
    const updateEduHonor = (ei: number, bi: number, val: string) => {
        const honors = [...cvData.education[ei].honors]
        honors[bi] = val
        updateEdu(ei, { honors })
    }
    const addEduHonor = (ei: number) =>
        updateEdu(ei, { honors: [...cvData.education[ei].honors, ''] })
    const removeEduHonor = (ei: number, bi: number) =>
        updateEdu(ei, { honors: cvData.education[ei].honors.filter((_, j) => j !== bi) })
    const addEdu = () =>
        update({ education: [...cvData.education, { institution: '', degree: '', major: '', start_date: '', end_date: '', location: null, gpa: null, honors: [] }] })
    const removeEdu = (i: number) =>
        update({ education: cvData.education.filter((_, j) => j !== i) })

    // ── Projects ──────────────────────────────────────────────────────────────

    const updateProj = (i: number, patch: Partial<CVProject>) => {
        const projs = [...cvData.projects]
        projs[i] = { ...projs[i], ...patch }
        update({ projects: projs })
    }
    const updateProjDesc = (pi: number, bi: number, val: string) => {
        const description = [...cvData.projects[pi].description]
        description[bi] = val
        updateProj(pi, { description })
    }
    const addProjDesc = (pi: number) =>
        updateProj(pi, { description: [...cvData.projects[pi].description, ''] })
    const removeProjDesc = (pi: number, bi: number) =>
        updateProj(pi, { description: cvData.projects[pi].description.filter((_, j) => j !== bi) })
    const addProj = () =>
        update({ projects: [...cvData.projects, { name: '', role: '', tech_stack: [], start_date: '', end_date: '', link: null, description: [''] }] })
    const removeProj = (i: number) =>
        update({ projects: cvData.projects.filter((_, j) => j !== i) })

    // ── Skills ────────────────────────────────────────────────────────────────

    const updateSkillGroup = (i: number, patch: Partial<CVSkillGroup>) => {
        const sgs = [...cvData.skill_groups]
        sgs[i] = { ...sgs[i], ...patch }
        update({ skill_groups: sgs })
    }
    const addSkillGroup = () =>
        update({ skill_groups: [...cvData.skill_groups, { category: '', skills: [] }] })
    const removeSkillGroup = (i: number) =>
        update({ skill_groups: cvData.skill_groups.filter((_, j) => j !== i) })

    // ── Awards & Certifications ───────────────────────────────────────────────

    const updateAward = (i: number, patch: Partial<CVAwardsCertification>) => {
        const aws = [...cvData.awards_certifications]
        aws[i] = { ...aws[i], ...patch }
        update({ awards_certifications: aws })
    }
    const addAward = () =>
        update({ awards_certifications: [...cvData.awards_certifications, { title: '', link: null }] })
    const removeAward = (i: number) =>
        update({ awards_certifications: cvData.awards_certifications.filter((_, j) => j !== i) })

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="h-full overflow-y-auto text-[#1C293C] flex flex-col divide-y-4 divide-black bg-[#FBFBF9]">

            {/* ── Personal Info ─────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<User className="w-3.5 h-3.5" />}
                    title="Personal Info"
                    expanded={expanded.personal ?? true}
                    onToggle={() => toggle('personal')}
                    onAdd={addLink}
                    addLabel="Add link"
                />
                {(expanded.personal ?? true) && (
                    <div className="p-3 flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                            <FieldRow label="Full Name">
                                <Input value={cvData.personal_info.name} onChange={(v) => updatePI('name', v)} placeholder="John Doe" />
                            </FieldRow>
                            <FieldRow label="Email">
                                <Input value={cvData.personal_info.email} onChange={(v) => updatePI('email', v)} placeholder="john@example.com" />
                            </FieldRow>
                            <FieldRow label="Phone">
                                <Input value={cvData.personal_info.phone ?? ''} onChange={(v) => updatePI('phone', v)} placeholder="+1 555 000 0000" />
                            </FieldRow>
                            <FieldRow label="Location">
                                <Input value={cvData.personal_info.location ?? ''} onChange={(v) => updatePI('location', v)} placeholder="San Francisco, CA" />
                            </FieldRow>
                        </div>

                        {cvData.personal_info.links.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide flex items-center gap-1">
                                    <Link className="w-3 h-3" /> Links
                                </span>
                                {cvData.personal_info.links.map((l, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={l.label}
                                            onChange={(e) => updateLink(i, 'label', e.target.value)}
                                            placeholder="LinkedIn"
                                            className="w-24 px-2 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                        />
                                        <input
                                            type="text"
                                            value={l.url}
                                            onChange={(e) => updateLink(i, 'url', e.target.value)}
                                            placeholder="https://linkedin.com/in/…"
                                            className="flex-1 px-2 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeLink(i)}
                                            className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Summary ───────────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<AlignLeft className="w-3.5 h-3.5" />}
                    title="Professional Summary"
                    expanded={expanded.summary ?? true}
                    onToggle={() => toggle('summary')}
                />
                {(expanded.summary ?? true) && (
                    <div className="p-3">
                        <Textarea
                            value={cvData.summary?.text ?? ''}
                            onChange={updateSummary}
                            placeholder="3-sentence executive summary tailored to the role…"
                            rows={4}
                        />
                    </div>
                )}
            </div>

            {/* ── Experiences ───────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<Briefcase className="w-3.5 h-3.5" />}
                    title="Experience"
                    expanded={expanded.experiences ?? true}
                    onToggle={() => toggle('experiences')}
                    onAdd={addExp}
                    addLabel="Add role"
                />
                {(expanded.experiences ?? true) && (
                    <div className="divide-y-4 divide-black/10">
                        {cvData.experiences.map((exp, ei) => (
                            <div key={ei} className="p-3 flex flex-col gap-3">
                                {/* Entry header */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-[#4B5563]">
                                        {exp.role || exp.company || `Role ${ei + 1}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeExp(ei)}
                                        className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FieldRow label="Role / Title">
                                        <Input value={exp.role} onChange={(v) => updateExp(ei, { role: v })} placeholder="Senior Engineer" />
                                    </FieldRow>
                                    <FieldRow label="Company">
                                        <Input value={exp.company} onChange={(v) => updateExp(ei, { company: v })} placeholder="Acme Corp" />
                                    </FieldRow>
                                    <FieldRow label="Date Range">
                                        <Input value={exp.date_range} onChange={(v) => updateExp(ei, { date_range: v })} placeholder="Jan 2021 – Present" />
                                    </FieldRow>
                                </div>

                                {/* Bullets */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide">Bullets</span>
                                    {exp.bullets.map((b, bi) => (
                                        <div key={bi} className="flex items-start gap-1.5">
                                            <span className="mt-2.5 w-1 h-1 rounded-full bg-black shrink-0" />
                                            <textarea
                                                value={b}
                                                onChange={(e) => updateExpBullet(ei, bi, e.target.value)}
                                                placeholder="Action verb + quantified result…"
                                                rows={2}
                                                className="flex-1 px-3 py-2 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors resize-none leading-relaxed"
                                            />
                                            <div className="flex flex-col gap-1 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => removeExpBullet(ei, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => addExpBullet(ei)}
                                        className="flex items-center gap-1 text-[11px] text-[#432DD7] hover:text-[#432DD7] transition-colors mt-1 self-start"
                                    >
                                        <Plus className="w-3 h-3" /> Add bullet
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Education ─────────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<GraduationCap className="w-3.5 h-3.5" />}
                    title="Education"
                    expanded={expanded.education ?? true}
                    onToggle={() => toggle('education')}
                    onAdd={addEdu}
                    addLabel="Add entry"
                />
                {(expanded.education ?? true) && (
                    <div className="divide-y-4 divide-black/10">
                        {cvData.education.map((edu, ei) => (
                            <div key={ei} className="p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-[#4B5563]">
                                        {edu.degree || edu.institution || `Entry ${ei + 1}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeEdu(ei)}
                                        className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FieldRow label="Degree">
                                        <Input value={edu.degree} onChange={(v) => updateEdu(ei, { degree: v })} placeholder="Bachelor of Science" />
                                    </FieldRow>
                                    <FieldRow label="Major / Field">
                                        <Input value={edu.major} onChange={(v) => updateEdu(ei, { major: v })} placeholder="Computer Science" />
                                    </FieldRow>
                                    <FieldRow label="Institution">
                                        <Input value={edu.institution} onChange={(v) => updateEdu(ei, { institution: v })} placeholder="MIT" />
                                    </FieldRow>
                                    <FieldRow label="Location">
                                        <Input value={edu.location ?? ''} onChange={(v) => updateEdu(ei, { location: v || null })} placeholder="Cambridge, MA" />
                                    </FieldRow>
                                    <FieldRow label="Start Date">
                                        <Input value={edu.start_date} onChange={(v) => updateEdu(ei, { start_date: v })} placeholder="Sep 2018" />
                                    </FieldRow>
                                    <FieldRow label="End Date">
                                        <Input value={edu.end_date} onChange={(v) => updateEdu(ei, { end_date: v })} placeholder="May 2022" />
                                    </FieldRow>
                                    <FieldRow label="GPA">
                                        <Input value={edu.gpa ?? ''} onChange={(v) => updateEdu(ei, { gpa: v || null })} placeholder="3.8/4.0" />
                                    </FieldRow>
                                </div>

                                {edu.honors.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide">Honors</span>
                                        {edu.honors.map((h, bi) => (
                                            <div key={bi} className="flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-black shrink-0" />
                                                <input
                                                    type="text"
                                                    value={h}
                                                    onChange={(e) => updateEduHonor(ei, bi, e.target.value)}
                                                    placeholder="Dean's List, Valedictorian…"
                                                    className="flex-1 px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeEduHonor(ei, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => addEduHonor(ei)}
                                    className="flex items-center gap-1 text-[11px] text-[#432DD7] hover:text-[#432DD7] transition-colors self-start"
                                >
                                    <Plus className="w-3 h-3" /> Add honor
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Projects ──────────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<FolderKanban className="w-3.5 h-3.5" />}
                    title="Projects"
                    expanded={expanded.projects ?? true}
                    onToggle={() => toggle('projects')}
                    onAdd={addProj}
                    addLabel="Add project"
                />
                {(expanded.projects ?? true) && (
                    <div className="divide-y-4 divide-black/10">
                        {cvData.projects.map((proj, pi) => (
                            <div key={pi} className="p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-[#4B5563]">
                                            {proj.name || `Project ${pi + 1}`}
                                        </span>
                                        {aiRecommendedProjectIndices.includes(pi) && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-[#FDC800] border border-black rounded-sm leading-none">
                                                ✨ AI
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeProj(pi)}
                                        className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FieldRow label="Project Name">
                                        <Input value={proj.name} onChange={(v) => updateProj(pi, { name: v })} placeholder="My Awesome Project" />
                                    </FieldRow>
                                    <FieldRow label="Your Role">
                                        <Input value={proj.role} onChange={(v) => updateProj(pi, { role: v })} placeholder="Backend Developer" />
                                    </FieldRow>
                                    <FieldRow label="Start Date">
                                        <Input value={proj.start_date} onChange={(v) => updateProj(pi, { start_date: v })} placeholder="Jan 2023" />
                                    </FieldRow>
                                    <FieldRow label="End Date">
                                        <Input value={proj.end_date} onChange={(v) => updateProj(pi, { end_date: v })} placeholder="Present" />
                                    </FieldRow>
                                    <FieldRow label="Link (optional)">
                                        <Input value={proj.link ?? ''} onChange={(v) => updateProj(pi, { link: v || null })} placeholder="https://github.com/…" />
                                    </FieldRow>
                                </div>

                                <FieldRow label="Tech Stack (comma-separated)">
                                    <input
                                        type="text"
                                        value={proj.tech_stack.join(', ')}
                                        onChange={(e) =>
                                            updateProj(pi, {
                                                tech_stack: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                                            })
                                        }
                                        placeholder="Python, FastAPI, PostgreSQL, Docker"
                                        className="px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                    />
                                </FieldRow>

                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide">Description</span>
                                    {proj.description.map((d, bi) => (
                                        <div key={bi} className="flex items-start gap-1.5">
                                            <span className="mt-2.5 w-1 h-1 rounded-full bg-black shrink-0" />
                                            <textarea
                                                value={d}
                                                onChange={(e) => updateProjDesc(pi, bi, e.target.value)}
                                                placeholder="Action verb + problem solved + measurable result…"
                                                rows={2}
                                                className="flex-1 px-3 py-2 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors resize-none leading-relaxed"
                                            />
                                            <div className="flex flex-col gap-1 mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => removeProjDesc(pi, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => addProjDesc(pi)}
                                        className="flex items-center gap-1 text-[11px] text-[#432DD7] hover:text-[#432DD7] transition-colors mt-1 self-start"
                                    >
                                        <Plus className="w-3 h-3" /> Add bullet
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Skills ────────────────────────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<Zap className="w-3.5 h-3.5" />}
                    title="Skills"
                    expanded={expanded.skills ?? true}
                    onToggle={() => toggle('skills')}
                    onAdd={addSkillGroup}
                    addLabel="Add group"
                />
                {(expanded.skills ?? true) && (
                    <div className="p-3 flex flex-col gap-3">
                        {cvData.skill_groups.map((sg, i) => (
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-none bg-[#FBFBF9] border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={sg.category}
                                        onChange={(e) => updateSkillGroup(i, { category: e.target.value })}
                                        placeholder="Category (e.g. Programming Languages)"
                                        className="flex-1 px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs font-semibold placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeSkillGroup(i)}
                                        className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={sg.skills.join(', ')}
                                    onChange={(e) =>
                                        updateSkillGroup(i, {
                                            skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                                        })
                                    }
                                    placeholder="Python, Go, TypeScript (comma-separated)"
                                    className="px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Awards & Certifications ───────────────────────────────────── */}
            <div>
                <SectionHeader
                    icon={<Award className="w-3.5 h-3.5" />}
                    title="Awards & Certifications"
                    expanded={expanded.awards ?? true}
                    onToggle={() => toggle('awards')}
                    onAdd={addAward}
                    addLabel="Add award"
                />
                {(expanded.awards ?? true) && (
                    <div className="p-3 flex flex-col gap-2">
                        {cvData.awards_certifications.map((aw, i) => (
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-none bg-[#FBFBF9] border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={aw.title}
                                        onChange={(e) => updateAward(i, { title: e.target.value })}
                                        placeholder="AWS Certified Solutions Architect – Associate"
                                        className="flex-1 px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeAward(i)}
                                        className="w-6 h-6 flex items-center justify-center rounded-none border-4 border-black text-[#1C293C] hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={aw.link ?? ''}
                                    onChange={(e) => updateAward(i, { link: e.target.value || null })}
                                    placeholder="https://credly.com/badges/… (optional verify link)"
                                    className="px-3 py-1.5 rounded-none bg-[#FBFBF9] border-4 border-black text-[#1C293C] text-xs placeholder:text-[#4B5563] outline-none focus:bg-[#FDC800] transition-colors"
                                />
                            </div>
                        ))}
                        {cvData.awards_certifications.length === 0 && (
                            <p className="text-[11px] text-[#4B5563] text-center py-2">
                                No awards or certifications yet. Click &ldquo;Add award&rdquo; to add one.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
