'use client'

import { useCallback, useState } from 'react'
import { FileText, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { CVResumeSchema, CVProject } from '@/services/api'

interface CVPreviewProps {
    cvData: CVResumeSchema | null
    /** When set, the compiled PDF is shown in an iframe instead of live HTML. */
    pdfUrl?: string
    isRendering?: boolean
}

export function CVPreview({ cvData, pdfUrl, isRendering = false }: CVPreviewProps) {
    const [zoom, setZoom] = useState(90)
    const [page, setPage] = useState(1)
    const totalPages = 1

    const handleZoomIn = useCallback(() => setZoom((z) => Math.min(200, z + 10)), [])
    const handleZoomOut = useCallback(() => setZoom((z) => Math.max(40, z - 10)), [])

    const showPdfFrame = Boolean(pdfUrl && !isRendering)

    return (
        <div className="relative h-full w-full bg-[#020617] flex flex-col overflow-hidden">
            {/* Chrome bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/60 shadow-[0_8px_30px_rgba(15,23,42,0.6)]">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400/40">
                        <FileText className="w-3.5 h-3.5 text-indigo-200" strokeWidth={1.6} />
                    </div>
                    <span className="text-sm uppercase tracking-[0.16em] text-slate-300 font-semibold">
                        {showPdfFrame ? 'PDF Output' : 'Live Preview'}
                    </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-200">
                    {/* Zoom controls */}
                    <div className="flex items-center gap-1.5 rounded-full bg-slate-900/60 px-2 py-1 border border-slate-700/70 shadow-inner shadow-black/40">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-[12px] text-slate-100 border border-slate-600/70 transition-colors"
                        >
                            -
                        </button>
                        <span className="min-w-[38px] text-center text-sm font-medium text-slate-100">
                            {zoom}%
                        </span>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-[12px] text-slate-100 border border-slate-600/70 transition-colors"
                        >
                            +
                        </button>
                    </div>

                    {/* Page navigation */}
                    {showPdfFrame && (
                        <div className="flex items-center gap-1.5 rounded-full bg-slate-900/60 px-2 py-1 border border-slate-700/70 shadow-inner shadow-black/40">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/70 transition-colors"
                            >
                                <ChevronLeft className="w-3 h-3 text-slate-100" />
                            </button>
                            <span className="min-w-[52px] text-center text-[13px] font-medium text-slate-100">
                                {page} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/70 transition-colors"
                            >
                                <ChevronRight className="w-3 h-3 text-slate-100" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-4 px-4 flex justify-center items-start min-h-0">
                {showPdfFrame ? (
                    <div className="relative w-full h-full min-h-[600px] rounded-md overflow-hidden bg-slate-900">
                        <iframe
                            src={pdfUrl}
                            title="Compiled PDF"
                            className="w-full h-full min-h-[600px] border-0"
                        />
                    </div>
                ) : (
                    <div
                        className="relative bg-white shadow-[0_18px_60px_rgba(15,23,42,0.9)] rounded-md mx-auto"
                        style={{
                            width: '210mm',
                            minHeight: '297mm',
                            padding: '14mm 18mm',
                            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                            fontSize: '9.5pt',
                            color: '#111827',
                            lineHeight: 1.45,
                            transform: `scale(${zoom / 100})`,
                            transformOrigin: 'top center',
                        }}
                    >
                        {/* Rendering overlay */}
                        {isRendering && (
                            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3 rounded-md">
                                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                <span className="text-sm font-medium text-slate-500">Rendering PDF…</span>
                            </div>
                        )}

                        {cvData ? (
                            <CVDocument cv={cvData} />
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-300 text-sm">
                                Your CV preview will appear here.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── CV Document renderer ─────────────────────────────────────────────────────

function CVDocument({ cv }: { cv: CVResumeSchema }) {
    const { personal_info: pi, summary, experiences, education, projects, skill_groups, awards_certifications } = cv

    return (
        <div>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1.5pt solid #1d4ed8' }}>
                <div style={{ fontSize: '20pt', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3pt', marginBottom: 4 }}>
                    {pi.name}
                </div>
                <div style={{ fontSize: '8.5pt', color: '#475569', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 6px' }}>
                    {pi.email && <span style={{ color: '#1d4ed8' }}>{pi.email}</span>}
                    {pi.phone && <><span style={{ color: '#cbd5e1' }}>·</span><span>{pi.phone}</span></>}
                    {pi.location && <><span style={{ color: '#cbd5e1' }}>·</span><span>{pi.location}</span></>}
                    {pi.links.map((l) => (
                        <span key={l.url}><span style={{ color: '#cbd5e1' }}>·</span> <span style={{ color: '#1d4ed8' }}>{l.label}</span></span>
                    ))}
                </div>
            </div>

            {/* Summary */}
            {summary && (
                <section style={{ marginBottom: 10 }}>
                    <SectionTitle>Professional Summary</SectionTitle>
                    <p style={{ fontSize: '9pt', color: '#334155', lineHeight: 1.55 }}>{summary.text}</p>
                </section>
            )}

            {/* Experience */}
            {experiences.length > 0 && (
                <section style={{ marginBottom: 10 }}>
                    <SectionTitle>Experience</SectionTitle>
                    {experiences.map((exp, i) => (
                        <div key={i} style={{ marginBottom: 7, pageBreakInside: 'avoid' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
                                <span style={{ fontSize: '9.5pt', fontWeight: 700, color: '#0f172a' }}>{exp.role}</span>
                                <span style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic', marginLeft: 8, whiteSpace: 'nowrap' }}>{exp.date_range}</span>
                            </div>
                            <div style={{ fontSize: '8.5pt', color: '#475569', fontStyle: 'italic', marginBottom: 3 }}>{exp.company}</div>
                            {exp.bullets.length > 0 && (
                                <ul style={{ paddingLeft: 14, marginTop: 3 }}>
                                    {exp.bullets.map((b, j) => (
                                        <li key={j} style={{ fontSize: '9pt', color: '#334155', marginBottom: 2, lineHeight: 1.42 }}>{b}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* Projects */}
            {projects.length > 0 && (
                <section style={{ marginBottom: 10 }}>
                    <SectionTitle>Projects</SectionTitle>
                    {projects.map((proj, i) => (
                        <ProjectEntry key={i} proj={proj} />
                    ))}
                </section>
            )}

            {/* Education */}
            {education.length > 0 && (
                <section style={{ marginBottom: 10 }}>
                    <SectionTitle>Education</SectionTitle>
                    {education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: 7, pageBreakInside: 'avoid' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
                                <span style={{ fontSize: '9.5pt', fontWeight: 700, color: '#0f172a' }}>
                                    {edu.degree}{edu.major ? ` — ${edu.major}` : ''}
                                </span>
                                <span style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic', marginLeft: 8, whiteSpace: 'nowrap' }}>
                                    {edu.start_date} – {edu.end_date}
                                </span>
                            </div>
                            <div style={{ fontSize: '8.5pt', color: '#475569', fontStyle: 'italic', marginBottom: 3 }}>
                                {edu.institution}
                                {edu.location ? ` · ${edu.location}` : ''}
                                {edu.gpa ? ` · GPA: ${edu.gpa}` : ''}
                            </div>
                            {edu.honors.length > 0 && (
                                <ul style={{ paddingLeft: 14, marginTop: 3 }}>
                                    {edu.honors.map((h, j) => (
                                        <li key={j} style={{ fontSize: '9pt', color: '#334155', marginBottom: 2, lineHeight: 1.42 }}>{h}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </section>
            )}

            {/* Skills */}
            {skill_groups.length > 0 && (
                <section style={{ marginBottom: 10 }}>
                    <SectionTitle>Skills</SectionTitle>
                    {skill_groups.map((sg, i) => (
                        <div key={i} style={{ display: 'flex', marginBottom: 3, fontSize: '9pt' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a', minWidth: 110, flexShrink: 0 }}>{sg.category}:</span>
                            <span style={{ color: '#475569' }}>{sg.skills.join(', ')}</span>
                        </div>
                    ))}
                </section>
            )}

            {/* Awards & Certifications */}
            {awards_certifications.length > 0 && (
                <section>
                    <SectionTitle>Awards &amp; Certifications</SectionTitle>
                    {awards_certifications.map((aw, i) => (
                        <div key={i} style={{ fontSize: '9pt', color: '#334155', marginBottom: 3 }}>
                            <span style={{ marginRight: 4 }}>·</span>
                            {aw.title}
                            {aw.link && (
                                <a
                                    href={aw.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#1d4ed8', fontSize: '8.5pt', marginLeft: 6 }}
                                >
                                    [verify ↗]
                                </a>
                            )}
                        </div>
                    ))}
                </section>
            )}
        </div>
    )
}

function ProjectEntry({ proj }: { proj: CVProject }) {
    return (
        <div style={{ marginBottom: 7, pageBreakInside: 'avoid' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
                <span style={{ fontSize: '9.5pt', fontWeight: 700, color: '#0f172a' }}>
                    {proj.name}
                    {proj.link && (
                        <a
                            href={proj.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '8pt', fontWeight: 400, color: '#1d4ed8', marginLeft: 6 }}
                        >
                            ↗
                        </a>
                    )}
                </span>
                <span style={{ fontSize: '8.5pt', color: '#64748b', fontStyle: 'italic', marginLeft: 8, whiteSpace: 'nowrap' }}>
                    {proj.start_date} – {proj.end_date}
                </span>
            </div>
            <div style={{ fontSize: '8.5pt', color: '#475569', fontStyle: 'italic', marginBottom: 3 }}>{proj.role}</div>
            {proj.tech_stack.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 4px', marginBottom: 4 }}>
                    {proj.tech_stack.map((t) => (
                        <span
                            key={t}
                            style={{
                                fontSize: '7.5pt',
                                color: '#1d4ed8',
                                background: 'rgba(29,78,216,0.07)',
                                border: '0.5pt solid rgba(29,78,216,0.2)',
                                borderRadius: 3,
                                padding: '1pt 4pt',
                            }}
                        >
                            {t}
                        </span>
                    ))}
                </div>
            )}
            {proj.description.length > 0 && (
                <ul style={{ paddingLeft: 14, marginTop: 3 }}>
                    {proj.description.map((b, j) => (
                        <li key={j} style={{ fontSize: '9pt', color: '#334155', marginBottom: 2, lineHeight: 1.42 }}>{b}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontSize: '9pt',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#1d4ed8',
            borderBottom: '0.75pt solid rgba(29,78,216,0.35)',
            paddingBottom: 2,
            marginTop: 10,
            marginBottom: 5,
        }}>
            {children}
        </div>
    )
}
