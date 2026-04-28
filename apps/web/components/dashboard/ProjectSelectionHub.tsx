'use client'

import { ArrowLeft, BookOpen, CheckSquare, Loader2, Sparkles, Square, Target, Zap } from 'lucide-react'
import { enhanceFromGallery } from '@/services/api'
import { useCVStore } from '@/store/useCVStore'

const FIT_THRESHOLD = 0.2

interface ProjectSelectionHubProps {
    onJobQueued: (jobId: string) => void
}

export function ProjectSelectionHub({ onJobQueued }: ProjectSelectionHubProps) {
    const {
        jdText,
        cvData,
        projectGallery,
        recommendedProjects,
        selectedProjectIds,
        galleryPhase,
        setSelectedProjectIds,
        finalizeGallery,
        resetGallery,
        setGalleryError,
    } = useCVStore()

    const galleryMap = new Map(projectGallery.map((p) => [p.id, p]))

    const hasRelevantProjects = recommendedProjects.some((p) => p.fit_score >= FIT_THRESHOLD)
    const isLoading = false

    const toggleProject = (id: string) => {
        if (selectedProjectIds.includes(id)) {
            setSelectedProjectIds(selectedProjectIds.filter((sid) => sid !== id))
        } else {
            setSelectedProjectIds([...selectedProjectIds, id])
        }
    }

    const handleGenerateCV = async () => {
        if (galleryPhase === 'FINALIZING') return

        const cvText =
            cvData
                ? JSON.stringify(cvData)
                : ''

        try {
            finalizeGallery()
            const response = await enhanceFromGallery({
                cv_text: cvText,
                jd_text: jdText,
                client_results: recommendedProjects.filter((r) =>
                    selectedProjectIds.includes(r.project_id)
                ),
            })
            onJobQueued(response.id)
        } catch (err) {
            setGalleryError(
                err instanceof Error ? err.message : 'Failed to start enhancement.'
            )
        }
    }

    const isFinalizing = galleryPhase === 'FINALIZING'

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <button
                        type="button"
                        onClick={resetGallery}
                        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[#4B5563] hover:text-[#1C293C] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Analysis
                    </button>
                    <h2 className="text-xl font-bold text-[#1C293C] flex items-center gap-2">
                        <Target className="w-5 h-5 text-[#FDC800]" />
                        AI Strategy: Recommended Projects
                    </h2>
                    <p className="mt-1 text-sm text-[#4B5563]">
                        Our AI ranked your projects by relevance to this job description.
                        Select the ones you want injected into your final CV.
                    </p>
                </div>
            </div>

            {hasRelevantProjects ? (
                <>
                    {/* Project Cards */}
                    <div className="space-y-3">
                        {recommendedProjects.map((project) => {
                            const isSelected = selectedProjectIds.includes(project.project_id)
                            const scorePct = Math.round(project.fit_score * 100)
                            const galleryItem = galleryMap.get(project.project_id)
                            const projectTitle = galleryItem?.title ?? project.project_id
                            const techStack = galleryItem?.tech_stack ?? []
                            const scoreColor =
                                project.fit_score >= 0.7
                                    ? 'bg-green-100 text-green-800 border-green-300'
                                    : project.fit_score >= 0.4
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                                    : 'bg-red-100 text-red-800 border-red-300'

                            return (
                                <button
                                    key={project.project_id}
                                    type="button"
                                    onClick={() => toggleProject(project.project_id)}
                                    className={`
                                        w-full text-left rounded-none border-2 border-black p-4
                                        transition-all duration-200
                                        ${isSelected
                                            ? 'bg-[#FDC800] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                                            : 'bg-[#FBFBF9] hover:bg-gray-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                                        }
                                    `}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 shrink-0 text-[#1C293C]">
                                            {isSelected ? (
                                                <CheckSquare className="w-5 h-5" />
                                            ) : (
                                                <Square className="w-5 h-5" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-[#1C293C] text-sm">
                                                    {projectTitle}
                                                </span>
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 text-xs font-bold border rounded-full ${scoreColor}`}
                                                >
                                                    {scorePct}% match
                                                </span>
                                            </div>
                                            {techStack.length > 0 && (
                                                <p className="mt-0.5 text-[11px] text-[#4B5563]">
                                                    {techStack.slice(0, 4).join(' · ')}
                                                    {techStack.length > 4 && ` +${techStack.length - 4}`}
                                                </p>
                                            )}
                                            <p className="mt-1 text-xs text-[#4B5563] leading-relaxed italic">
                                                {project.client_reasoning}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Summary line */}
                    <p className="text-xs text-[#4B5563]">
                        {selectedProjectIds.length} of {recommendedProjects.length} project
                        {recommendedProjects.length !== 1 ? 's' : ''} selected
                    </p>
                </>
            ) : (
                /* Empty / Unrelated State — Roadmap for Success */
                <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 space-y-4">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-[#FDC800]" />
                        <h3 className="font-bold text-[#1C293C]">Roadmap for Success</h3>
                    </div>
                    <p className="text-sm text-[#4B5563] leading-relaxed">
                        None of your current projects closely match this job description.
                        Here&apos;s what you should build to become a strong candidate:
                    </p>
                    <RecommendedActions />
                    <p className="text-xs text-[#4B5563] mt-4 italic">
                        We&apos;ll still generate your CV optimised for this JD — the AI
                        will highlight your transferable skills and include these
                        recommendations in the CV output.
                    </p>
                </div>
            )}

            {/* Generate CTA */}
            <button
                type="button"
                onClick={handleGenerateCV}
                disabled={isFinalizing || isLoading}
                className="
                    w-full inline-flex items-center justify-center gap-2.5 px-6 py-4
                    font-bold text-sm tracking-wide
                    rounded-none border-4 border-black bg-[#FDC800] text-[#1C293C]
                    shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                    hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]
                    disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                    transition-all duration-300
                "
            >
                {isFinalizing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating your strategic CV…
                    </>
                ) : (
                    <>
                        <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                        {hasRelevantProjects
                            ? `Generate Final CV (${selectedProjectIds.length} project${selectedProjectIds.length !== 1 ? 's' : ''})`
                            : 'Generate CV with Roadmap'}
                    </>
                )}
            </button>
        </div>
    )
}

// ── Sub-component: recommended_actions from the store ───────────────────────

function RecommendedActions() {
    const { cvData } = useCVStore()
    const actions = cvData?.recommended_actions ?? []

    if (actions.length === 0) {
        return (
            <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-[#1C293C]">
                    <Zap className="w-4 h-4 mt-0.5 text-[#FDC800] shrink-0" />
                    Build projects that directly use the technologies listed in the JD.
                </li>
                <li className="flex items-start gap-2 text-sm text-[#1C293C]">
                    <Zap className="w-4 h-4 mt-0.5 text-[#FDC800] shrink-0" />
                    Focus on measurable outcomes you can describe using the STAR method.
                </li>
            </ul>
        )
    }

    return (
        <ul className="space-y-2">
            {actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#1C293C]">
                    <Zap className="w-4 h-4 mt-0.5 text-[#FDC800] shrink-0" />
                    {action}
                </li>
            ))}
        </ul>
    )
}
