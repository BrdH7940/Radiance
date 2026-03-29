'use client'

import {
    useState,
    useCallback,
    useRef,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react'
import {
    ChevronDown,
    ChevronRight,
    Plus,
    Trash2,
    Sparkles,
    Loader2,
    Wand2,
    X,
    CornerDownLeft,
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
import { aiRefineText } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CVFormBuilderProps {
    cvData: CVResumeSchema
    onChange: (updated: CVResumeSchema) => void
}

type AITarget = { value: string; onApply: (v: string) => void }

const QUICK_PROMPTS = [
    'Make it STAR format',
    'Add metrics & numbers',
    'Stronger action verbs',
    'Make it more concise',
]

// ─── AI Rewrite Popover ───────────────────────────────────────────────────────

function AIPopover({
    target,
    onClose,
}: {
    target: AITarget
    onClose: () => void
}) {
    const [prompt, setPrompt] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const handleSubmit = useCallback(async () => {
        const trimmed = prompt.trim()
        if (!trimmed || isLoading) return
        setError(null)
        setIsLoading(true)
        try {
            const { newText } = await aiRefineText(target.value, trimmed)
            target.onApply(newText)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'AI request failed.')
        } finally {
            setIsLoading(false)
        }
    }, [prompt, isLoading, target, onClose])

    const handleKey = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
            if (e.key === 'Escape') onClose()
        },
        [handleSubmit, onClose]
    )

    return (
        <div className="mt-2 rounded-2xl border border-violet-500/20 bg-[#0a0f18]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                <Sparkles className="w-3 h-3 text-violet-400" strokeWidth={2} />
                <span className="text-[10px] font-bold text-violet-400 tracking-wider">RADIANCE AI</span>
                <div className="flex-1" />
                <span className="text-[10px] text-slate-600 font-mono truncate max-w-[160px]">
                    &ldquo;{target.value.slice(0, 40)}{target.value.length > 40 ? '…' : ''}&rdquo;
                </span>
                <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded-full text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors">
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Quick prompts */}
            <div className="flex gap-1.5 px-3 pt-2 flex-wrap">
                {QUICK_PROMPTS.map((s) => (
                    <button
                        key={s}
                        onClick={() => { setPrompt(s); inputRef.current?.focus() }}
                        className="px-2 py-0.5 rounded-full text-[10px] text-slate-400 border border-white/8 hover:border-violet-500/40 hover:text-violet-300 hover:bg-violet-500/5 transition-all duration-200"
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 p-2.5">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.03] focus-within:border-violet-500/40 transition-all duration-300">
                    <Wand2 className="w-3.5 h-3.5 text-slate-600 shrink-0" strokeWidth={1.5} />
                    <input
                        ref={inputRef}
                        autoFocus
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKey}
                        placeholder="Ask AI to rewrite this…"
                        disabled={isLoading}
                        className="flex-1 bg-transparent text-slate-200 text-xs placeholder:text-slate-700 outline-none min-w-0"
                    />
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={!prompt.trim() || isLoading}
                    className={`flex items-center gap-1 px-3 py-2 rounded-2xl text-xs font-semibold transition-all duration-300 shrink-0 ${
                        prompt.trim() && !isLoading
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/30 hover:brightness-110'
                            : 'bg-white/5 text-slate-600 cursor-not-allowed'
                    }`}
                >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CornerDownLeft className="w-3 h-3" /> Go</>}
                </button>
            </div>
            {(isLoading || error) && (
                <div className={`px-3 pb-2 text-[10px] ${error ? 'text-red-400' : 'text-slate-500'}`}>
                    {isLoading ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />Rewriting…</span> : error}
                </div>
            )}
        </div>
    )
}

// ─── AI Field Button ──────────────────────────────────────────────────────────

function AIBtn({ value, onApply }: { value: string; onApply: (v: string) => void }) {
    const [open, setOpen] = useState(false)

    if (open) {
        return (
            <AIPopover
                target={{ value, onApply }}
                onClose={() => setOpen(false)}
            />
        )
    }

    return (
        <button
            type="button"
            onClick={() => setOpen(true)}
            title="AI Rewrite"
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 hover:border-violet-500/40 transition-all duration-200"
        >
            <Sparkles className="w-3 h-3" />
        </button>
    )
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
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-2 flex-1 text-left"
            >
                <span className="text-slate-500">{icon}</span>
                <span className="text-sm font-semibold text-slate-200">{title}</span>
                <span className="text-slate-600 ml-auto">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
            </button>
            {onAdd && (
                <button
                    type="button"
                    onClick={onAdd}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-medium text-indigo-300 border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/15 transition-all duration-200"
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
            <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{label}</label>
            {children}
        </div>
    )
}

function Input({
    value,
    onChange,
    placeholder,
    showAI = false,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    showAI?: boolean
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <input
                    type="text"
                    value={value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-sm placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                />
                {showAI && value && <AIBtn value={value} onApply={onChange} />}
            </div>
        </div>
    )
}

function Textarea({
    value,
    onChange,
    placeholder,
    rows = 3,
    showAI = false,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    rows?: number
    showAI?: boolean
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-start gap-1.5">
                <textarea
                    value={value}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-sm placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors resize-none leading-relaxed"
                />
                {showAI && value && (
                    <div className="mt-1">
                        <AIBtn value={value} onApply={onChange} />
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CVFormBuilder({ cvData, onChange }: CVFormBuilderProps) {
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
        <div className="h-full overflow-y-auto text-slate-200 flex flex-col divide-y divide-white/5">

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
                                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                    <Link className="w-3 h-3" /> Links
                                </span>
                                {cvData.personal_info.links.map((l, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={l.label}
                                            onChange={(e) => updateLink(i, 'label', e.target.value)}
                                            placeholder="LinkedIn"
                                            className="w-24 px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                        />
                                        <input
                                            type="text"
                                            value={l.url}
                                            onChange={(e) => updateLink(i, 'url', e.target.value)}
                                            placeholder="https://linkedin.com/in/…"
                                            className="flex-1 px-2 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeLink(i)}
                                            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                            showAI
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
                    <div className="divide-y divide-white/[0.04]">
                        {cvData.experiences.map((exp, ei) => (
                            <div key={ei} className="p-3 flex flex-col gap-3">
                                {/* Entry header */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">
                                        {exp.role || exp.company || `Role ${ei + 1}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeExp(ei)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Bullets</span>
                                    {exp.bullets.map((b, bi) => (
                                        <div key={bi} className="flex items-start gap-1.5">
                                            <span className="mt-2.5 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                            <textarea
                                                value={b}
                                                onChange={(e) => updateExpBullet(ei, bi, e.target.value)}
                                                placeholder="Action verb + quantified result…"
                                                rows={2}
                                                className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors resize-none leading-relaxed"
                                            />
                                            <div className="flex flex-col gap-1 mt-1">
                                                {b && <AIBtn value={b} onApply={(v) => updateExpBullet(ei, bi, v)} />}
                                                <button
                                                    type="button"
                                                    onClick={() => removeExpBullet(ei, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => addExpBullet(ei)}
                                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors mt-1 self-start"
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
                    <div className="divide-y divide-white/[0.04]">
                        {cvData.education.map((edu, ei) => (
                            <div key={ei} className="p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">
                                        {edu.degree || edu.institution || `Entry ${ei + 1}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeEdu(ei)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Honors</span>
                                        {edu.honors.map((h, bi) => (
                                            <div key={bi} className="flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                                <input
                                                    type="text"
                                                    value={h}
                                                    onChange={(e) => updateEduHonor(ei, bi, e.target.value)}
                                                    placeholder="Dean's List, Valedictorian…"
                                                    className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeEduHonor(ei, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors self-start"
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
                    <div className="divide-y divide-white/[0.04]">
                        {cvData.projects.map((proj, pi) => (
                            <div key={pi} className="p-3 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">
                                        {proj.name || `Project ${pi + 1}`}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeProj(pi)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                                        className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                    />
                                </FieldRow>

                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Description</span>
                                    {proj.description.map((d, bi) => (
                                        <div key={bi} className="flex items-start gap-1.5">
                                            <span className="mt-2.5 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                                            <textarea
                                                value={d}
                                                onChange={(e) => updateProjDesc(pi, bi, e.target.value)}
                                                placeholder="Action verb + problem solved + measurable result…"
                                                rows={2}
                                                className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors resize-none leading-relaxed"
                                            />
                                            <div className="flex flex-col gap-1 mt-1">
                                                {d && <AIBtn value={d} onApply={(v) => updateProjDesc(pi, bi, v)} />}
                                                <button
                                                    type="button"
                                                    onClick={() => removeProjDesc(pi, bi)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => addProjDesc(pi)}
                                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors mt-1 self-start"
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
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={sg.category}
                                        onChange={(e) => updateSkillGroup(i, { category: e.target.value })}
                                        placeholder="Category (e.g. Programming Languages)"
                                        className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs font-semibold placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeSkillGroup(i)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
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
                                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
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
                            <div key={i} className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={aw.title}
                                        onChange={(e) => updateAward(i, { title: e.target.value })}
                                        placeholder="AWS Certified Solutions Architect – Associate"
                                        className="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                    />
                                    {aw.title && <AIBtn value={aw.title} onApply={(v) => updateAward(i, { title: v })} />}
                                    <button
                                        type="button"
                                        onClick={() => removeAward(i)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={aw.link ?? ''}
                                    onChange={(e) => updateAward(i, { link: e.target.value || null })}
                                    placeholder="https://credly.com/badges/… (optional verify link)"
                                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-200 text-xs placeholder:text-slate-700 outline-none focus:border-indigo-500/40 transition-colors"
                                />
                            </div>
                        ))}
                        {cvData.awards_certifications.length === 0 && (
                            <p className="text-[11px] text-slate-600 text-center py-2">
                                No awards or certifications yet. Click &ldquo;Add award&rdquo; to add one.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
