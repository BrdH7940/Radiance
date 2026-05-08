'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Download,
    FileJson,
    Zap,
    ChevronLeft,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    SplitSquareHorizontal,
    Sparkles,
    BookMarked,
    Loader2,
} from 'lucide-react'
import { NavBar } from '@/components/ui/NavBar'
import { CVFormBuilder } from '@/components/editor/CVFormBuilder'
import { CVPreview } from '@/components/editor/CVPreview'
import { ProjectSelectionHub } from '@/components/dashboard/ProjectSelectionHub'
import { useCVStore } from '@/store/useCVStore'
import { renderCvToPdf, AnalysisService } from '@/services/api'
import type { CVResumeSchema } from '@/services/api'
import { getHistoryItem } from '@/services/historyApi'
import { analyzeProjectsWithClientAI, type OnProgressCallback } from '@/services/aiClientService'

// ─── Notification ─────────────────────────────────────────────────────────────

type NotificationType = 'success' | 'error' | 'info'

interface Notification {
    id: number
    message: string
    type: NotificationType
}

const GALLERY_STEP_LABELS: Record<0 | 1 | 2, string> = {
    0: 'Starting AI analysis…',
    1: 'Step 1/2: Ranking Projects…',
    2: 'Step 2/2: Generating AI Reasoning…',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function WorkspacePageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const historyId = searchParams.get('id')
    const view = searchParams.get('view')

    const {
        user,
        cvData,
        setCvData,
        pdfUrl,
        setPdfUrl,
        setPhase,
        setInputReviewMode,
        selectedProjectIds,
        jdText,
        setJdText,
        setAnalysisResult,
        setJobId,
        projectGallery,
        galleryOwnerUserId,
        setProjectGallery,
        galleryPhase,
        galleryLoadingStep,
        startGalleryAnalysis,
        consultGallery,
        setGalleryError,
        setGalleryLoadingStep,
        resetGallery,
        completeGallery,
        galleryError,
    } = useCVStore()

    // When the CV came from the gallery flow, mark all injected projects with the AI badge.
    // The strategic enhancer replaces the entire projects section, so all current projects
    // are gallery-sourced when selectedProjectIds is non-empty.
    const aiRecommendedProjectIndices =
        selectedProjectIds.length > 0
            ? (cvData?.projects.map((_, i) => i) ?? [])
            : []

    const isGalleryEnhanced = selectedProjectIds.length > 0

    const [isRendering, setIsRendering] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const notifIdRef = useRef(0)

    const [leftPaneWidth, setLeftPaneWidth] = useState(48)
    const [isResizing, setIsResizing] = useState(false)
    const splitPaneRef = useRef<HTMLDivElement | null>(null)

    // History auto-load state — when arriving with `?id=` and no cvData, fetch first.
    const [historyLoading, setHistoryLoading] = useState<boolean>(
        Boolean(historyId) && !cvData
    )
    const [historyError, setHistoryError] = useState<string | null>(null)

    // Gallery FSM job-polling
    const [galleryJobId, setGalleryJobId] = useState<string | null>(null)

    // ── Notification helpers ──────────────────────────────────────────────────

    const showNotification = useCallback(
        (message: string, type: NotificationType = 'success') => {
            const id = ++notifIdRef.current
            setNotifications((prev) => [...prev, { id, message, type }])
            setTimeout(
                () =>
                    setNotifications((prev) => prev.filter((n) => n.id !== id)),
                3500
            )
        },
        []
    )

    // ── Auto-load from history when `?id=` is present and store is empty ──────

    useEffect(() => {
        if (cvData || !historyId) return

        let cancelled = false
        const load = async () => {
            setHistoryLoading(true)
            setHistoryError(null)
            try {
                const entry = await getHistoryItem(historyId)
                if (cancelled) return
                if (!entry.enhanced_cv_json) {
                    setHistoryError(
                        'This history entry has no editable CV data. It may have been created before the editor was enabled.'
                    )
                    return
                }
                setCvData(entry.enhanced_cv_json as CVResumeSchema)
                setPdfUrl('')
                setJdText(entry.jd_text ?? '')
                setAnalysisResult({
                    matching_score: entry.matching_score ?? 0,
                    missing_skills: [],
                    red_flags: [],
                    enhanced_cv_json: entry.enhanced_cv_json as CVResumeSchema,
                    pdf_url: '',
                })
                setPhase('workspace')
            } catch (err: unknown) {
                if (cancelled) return
                setHistoryError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load history entry.'
                )
            } finally {
                if (!cancelled) setHistoryLoading(false)
            }
        }
        void load()
        return () => {
            cancelled = true
        }
    }, [
        cvData,
        historyId,
        setCvData,
        setPdfUrl,
        setJdText,
        setAnalysisResult,
        setPhase,
    ])

    // ── Guard: if we have no cvData and no historyId, send the user home ──────

    useEffect(() => {
        if (cvData) return
        if (historyId) return
        router.replace('/')
    }, [cvData, historyId, router])

    // ── Lazy-load project gallery once we know the current user ───────────────

    useEffect(() => {
        const currentUserId = user?.id ?? null
        if (!currentUserId) return
        if (projectGallery.length > 0 && galleryOwnerUserId === currentUserId) return

        const loadGallery = async () => {
            try {
                const { getSupabaseToken } = await import('@/services/api')
                const token = await getSupabaseToken()
                if (!token) return

                const API_BASE =
                    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
                const res = await fetch(`${API_BASE}/api/v1/projects`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!res.ok) return

                const data = (await res.json()) as Array<{
                    id: string
                    title: string
                    description: string | null
                    technologies: string[]
                }>
                setProjectGallery(
                    data.map((p) => ({
                        id: p.id,
                        title: p.title,
                        description: p.description,
                        tech_stack: p.technologies,
                    })),
                    currentUserId
                )
            } catch {
                // Non-fatal — gallery action will surface its own errors when invoked.
            }
        }
        void loadGallery()
    }, [user?.id, projectGallery.length, galleryOwnerUserId, setProjectGallery])

    // ── Poll for gallery job completion ────────────────────────────────────────

    useEffect(() => {
        if (!galleryJobId || galleryPhase !== 'FINALIZING') return

        const POLL_INTERVAL_MS = 2000
        const MAX_POLL_ATTEMPTS = 300 // ~10 minutes
        let attempts = 0

        const intervalId = setInterval(async () => {
            attempts++
            if (attempts > MAX_POLL_ATTEMPTS) {
                clearInterval(intervalId)
                setGalleryError('Strategic CV generation timed out. Please try again.')
                return
            }

            try {
                const statusResponse = await AnalysisService.pollJobStatus(galleryJobId)
                if (statusResponse.status === 'completed' && statusResponse.result) {
                    clearInterval(intervalId)
                    setCvData(statusResponse.result.enhanced_cv_json)
                    setPdfUrl(statusResponse.result.pdf_url)
                    setPhase('workspace')
                    setGalleryJobId(null)
                    completeGallery()
                    showNotification('Strategic CV generated.', 'success')
                } else if (statusResponse.status === 'failed') {
                    clearInterval(intervalId)
                    setGalleryError(
                        statusResponse.error ?? 'Gallery enhancement failed.'
                    )
                }
            } catch {
                clearInterval(intervalId)
                setGalleryError('Failed to poll gallery job status.')
            }
        }, POLL_INTERVAL_MS)

        return () => clearInterval(intervalId)
    }, [
        galleryJobId,
        galleryPhase,
        setCvData,
        setPdfUrl,
        setPhase,
        setGalleryError,
        completeGallery,
        showNotification,
    ])

    // ── Split-pane resize ─────────────────────────────────────────────────────

    const handleResizeMouseDown = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            event.preventDefault()
            setIsResizing(true)
        },
        []
    )

    useEffect(() => {
        if (!isResizing) return
        const handleMouseMove = (event: MouseEvent) => {
            const container = splitPaneRef.current
            if (!container) return
            const rect = container.getBoundingClientRect()
            const pct = ((event.clientX - rect.left) / rect.width) * 100
            setLeftPaneWidth(Math.max(30, Math.min(70, pct)))
        }
        const handleMouseUp = () => setIsResizing(false)
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isResizing])

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleCvChange = useCallback(
        (updated: CVResumeSchema) => {
            setCvData(updated)
            // Clear cached PDF when data changes so preview stays in live mode
            if (pdfUrl) setPdfUrl('')
        },
        [setCvData, pdfUrl, setPdfUrl]
    )

    const handleRenderPdf = useCallback(async () => {
        if (isRendering || !cvData) return
        setIsRendering(true)
        try {
            const data = await renderCvToPdf(cvData)
            if (data.success && data.pdf_url) {
                setPdfUrl(data.pdf_url)
                showNotification('PDF rendered successfully.', 'success')
            } else {
                showNotification(data.error ?? 'Render failed.', 'error')
            }
        } catch (err) {
            showNotification(
                err instanceof Error ? err.message : 'Render failed.',
                'error'
            )
        } finally {
            setIsRendering(false)
        }
    }, [isRendering, cvData, setPdfUrl, showNotification])

    const handleDownloadJson = useCallback(() => {
        if (!cvData) return
        const blob = new Blob([JSON.stringify(cvData, null, 2)], {
            type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'cv-data.json'
        a.click()
        URL.revokeObjectURL(url)
        showNotification('CV data downloaded as JSON.', 'info')
    }, [cvData, showNotification])

    const handleDownloadPDF = useCallback(() => {
        if (pdfUrl) {
            const a = document.createElement('a')
            a.href = pdfUrl
            a.download = 'resume.pdf'
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.click()
            showNotification('PDF download started.', 'info')
        } else {
            showNotification(
                'Render the PDF first using the "Render PDF" button.',
                'error'
            )
        }
    }, [pdfUrl, showNotification])

    // ── Strategic Gallery flow (mirrors dashboard/page.tsx) ───────────────────

    const galleryRequiresJd =
        !jdText || jdText.trim().length < 50
    const galleryDisabled =
        galleryRequiresJd || projectGallery.length === 0 || galleryPhase !== 'IDLE'

    const handleOptimizeWithGallery = useCallback(async () => {
        if (galleryRequiresJd) {
            showNotification(
                'No job description on file for this entry — cannot run gallery analysis.',
                'error'
            )
            return
        }
        if (projectGallery.length === 0) {
            showNotification(
                'Add projects to your Gallery first to use Strategic Mode.',
                'error'
            )
            return
        }

        startGalleryAnalysis()

        const onProgress: OnProgressCallback = (step) => {
            setGalleryLoadingStep(step)
        }

        try {
            const results = await analyzeProjectsWithClientAI(
                jdText,
                projectGallery,
                onProgress
            )
            consultGallery(results)
        } catch (err) {
            setGalleryError(
                err instanceof Error
                    ? err.message
                    : 'AI analysis failed. Please try again.'
            )
        }
    }, [
        galleryRequiresJd,
        projectGallery,
        jdText,
        startGalleryAnalysis,
        consultGallery,
        setGalleryError,
        setGalleryLoadingStep,
        showNotification,
    ])

    const handleStepClick = useCallback(
        (step: number) => {
            if (historyId) {
                if (step === 1) {
                    router.push(`/workspace?id=${historyId}&view=jd`)
                    return
                }
                if (step === 2) {
                    setInputReviewMode(false)
                    setPhase('dashboard')
                    router.push('/dashboard')
                    return
                }
                if (step === 3) {
                    router.push(`/workspace?id=${historyId}`)
                    return
                }
                return
            }

            if (step === 1) {
                setInputReviewMode(true)
                setPhase('upload')
                router.push('/dashboard')
                return
            }

            if (step === 2) {
                setInputReviewMode(false)
                setPhase('dashboard')
                router.push('/dashboard')
                return
            }
        },
        [historyId, router, setInputReviewMode, setPhase]
    )

    // ── Render ────────────────────────────────────────────────────────────────

    if (historyLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#FBFBF9] text-[#1C293C]">
                <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1C293C]" />
                    <p className="font-bold text-sm">Loading your history entry…</p>
                </div>
            </div>
        )
    }

    if (historyError) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#FBFBF9] text-[#1C293C] px-6">
                <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm">
                    <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-500" />
                    <p className="font-bold text-sm mb-1">Could not load history</p>
                    <p className="text-xs text-[#4B5563] mb-4">{historyError}</p>
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/history')}
                        className="px-4 py-2 rounded-none border-2 border-black bg-[#FDC800] text-sm font-bold text-[#1C293C] hover:opacity-80 transition-opacity"
                    >
                        Back to History
                    </button>
                </div>
            </div>
        )
    }

    if (!cvData) return null

    if (historyId && view === 'jd') {
        return (
            <div className="h-screen flex flex-col overflow-hidden bg-[#FBFBF9] text-[#1C293C]">
                <NavBar activeStep={1} onStepClick={handleStepClick} />

                <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b-4 border-black bg-[#FBFBF9]">
                    <button
                        onClick={() => router.push(`/workspace?id=${historyId}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-4 border-black bg-[#FBFBF9] text-[#1C293C] text-xs font-medium hover:bg-[#FDC800] transition-all duration-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Back
                    </button>

                    <div className="h-4 w-px bg-black/20" />

                    <div className="text-xs font-semibold tracking-wider uppercase text-[#4B5563]">
                        Job Description
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="rounded-none border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h1 className="text-xl sm:text-2xl font-black tracking-tighter text-[#1C293C]">
                                    Job Description
                                </h1>
                            </div>

                            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#1C293C]">
                                {jdText?.trim()
                                    ? jdText
                                    : 'No job description was saved for this entry.'}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-[#FBFBF9] text-[#1C293C]">
            <NavBar activeStep={3} onStepClick={handleStepClick} />

            {/* ── Toolbar ──────────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b-4 border-black bg-[#FBFBF9]">
                <button
                    onClick={() =>
                        historyId
                            ? router.push('/dashboard/history')
                            : router.push('/dashboard')
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-4 border-black bg-[#FBFBF9] text-[#1C293C] text-xs font-medium hover:bg-[#FDC800] transition-all duration-200 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {historyId ? 'History' : 'Upload'}
                </button>

                <div className="h-4 w-px bg-black/20" />

                <div className="flex items-center gap-1.5 text-[#4B5563] text-xs">
                    <SplitSquareHorizontal className="w-3.5 h-3.5 text-[#1C293C]" />
                    <span className="hidden sm:block">CV Editor</span>
                </div>

                {isGalleryEnhanced && (
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-none border-2 border-black bg-[#FDC800] text-[#1C293C] text-xs font-bold">
                        <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                        Strategic Mode
                    </div>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    {/* Optimize with Project Gallery */}
                    <button
                        onClick={handleOptimizeWithGallery}
                        disabled={galleryDisabled}
                        title={
                            galleryRequiresJd
                                ? 'No job description available for this entry'
                                : projectGallery.length === 0
                                  ? 'Add projects to your Gallery first'
                                  : 'Re-rank your projects against this job and inject the best ones'
                        }
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-none text-xs font-semibold border-4 border-black bg-[#432DD7] text-white hover:bg-[#5840E0] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                    >
                        <BookMarked className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Optimize with</span> Gallery
                    </button>

                    {/* Sync Changes / Render PDF */}
                    <button
                        onClick={handleRenderPdf}
                        disabled={isRendering}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-none text-xs font-semibold border-4 border-black bg-[#FDC800] text-[#1C293C] hover:bg-[#FDC800] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                    >
                        <RefreshCw
                            className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`}
                        />
                        {isRendering ? 'Rendering…' : isGalleryEnhanced ? 'Sync Changes' : 'Render PDF'}
                    </button>

                    {/* Export JSON */}
                    <button
                        onClick={handleDownloadJson}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-none text-xs font-semibold border-4 border-black bg-[#FBFBF9] text-[#1C293C] hover:bg-[#432DD7] hover:text-white transition-all duration-300 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                    >
                        <FileJson className="w-3.5 h-3.5" />
                        JSON
                    </button>

                    {/* Download PDF */}
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-none text-xs font-semibold border-4 border-black bg-[#FBFBF9] text-[#1C293C] hover:bg-[#432DD7] hover:text-white transition-all duration-300 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                    >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                    </button>

                    {/* AI indicator */}
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-none border-4 border-black bg-[#16A34A]">
                        <Zap className="w-3 h-3 text-white" strokeWidth={2.5} />
                        <span className="text-xs text-white font-medium">
                            Editor Active
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Split pane ──────────────────────────────────────────────────── */}
            <div
                ref={splitPaneRef}
                className="flex-1 flex overflow-hidden min-h-0"
            >
                {/* Left — Form Builder */}
                <div
                    className="flex flex-col border-r-4 border-black min-w-0 flex-none bg-[#FBFBF9]"
                    style={{ width: `${leftPaneWidth}%` }}
                >
                    <div className="shrink-0 flex items-center px-4 py-2 border-b-4 border-black bg-[#FBFBF9]">
                        <span className="text-sm text-[#1C293C] font-medium">
                            Edit CV
                        </span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CVFormBuilder
                            cvData={cvData}
                            onChange={handleCvChange}
                            aiRecommendedProjectIndices={aiRecommendedProjectIndices}
                        />
                    </div>
                </div>

                {/* Resize handle */}
                <div
                    onMouseDown={handleResizeMouseDown}
                    className={`flex-none w-2 cursor-col-resize bg-black hover:bg-[#432DD7] transition-colors ${isResizing ? 'bg-[#432DD7]' : ''}`}
                />

                {/* Right — Preview */}
                <div className="flex-1 flex flex-col min-w-0">
                    <CVPreview
                        cvData={cvData}
                        pdfUrl={pdfUrl}
                        isRendering={isRendering}
                    />
                </div>
            </div>

            {/* ── Gallery FSM overlay ─────────────────────────────────────────── */}
            <GalleryOverlay
                galleryPhase={galleryPhase}
                galleryLoadingStep={galleryLoadingStep}
                galleryError={galleryError}
                onJobQueued={(jobId) => {
                    setGalleryJobId(jobId)
                    setJobId(jobId)
                }}
                onClose={() => {
                    resetGallery()
                    setGalleryJobId(null)
                }}
            />

            {/* ── Toast notifications ─────────────────────────────────────────── */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
                {notifications.map((n) => (
                    <div
                        key={n.id}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-none border-4 border-black text-sm font-medium shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in slide-in-from-bottom-8 fade-in duration-300 ${
                            n.type === 'success'
                                ? 'bg-[#16A34A] text-white'
                                : n.type === 'error'
                                  ? 'bg-[#DC2626] text-white'
                                  : 'bg-[#FDC800] text-[#1C293C]'
                        }`}
                    >
                        {n.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : n.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 shrink-0" />
                        ) : (
                            <Download className="w-4 h-4 shrink-0" />
                        )}
                        {n.message}
                    </div>
                ))}
            </div>
        </div>
    )
}

// ─── Gallery overlay ──────────────────────────────────────────────────────────

interface GalleryOverlayProps {
    galleryPhase: ReturnType<typeof useCVStore.getState>['galleryPhase']
    galleryLoadingStep: 0 | 1 | 2
    galleryError: string
    onJobQueued: (jobId: string) => void
    onClose: () => void
}

function GalleryOverlay({
    galleryPhase,
    galleryLoadingStep,
    galleryError,
    onJobQueued,
    onClose,
}: GalleryOverlayProps) {
    if (galleryPhase === 'IDLE') return null

    return (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto">
            <div className="my-10 mx-4 w-full max-w-3xl rounded-none border-4 border-black bg-[#FBFBF9] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
                {galleryPhase === 'ANALYZING' && (
                    <div className="flex flex-col items-center justify-center py-10 gap-6">
                        <div className="rounded-none border-4 border-black bg-[#FDC800] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm w-full">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1C293C]" />
                            <p className="font-bold text-[#1C293C] text-sm">
                                {GALLERY_STEP_LABELS[galleryLoadingStep]}
                            </p>
                            <p className="text-xs text-[#1C293C]/70 mt-1">
                                Running locally in your browser — no API cost
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 w-full max-w-sm">
                            {([1, 2] as const).map((step) => (
                                <div
                                    key={step}
                                    className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
                                        galleryLoadingStep >= step
                                            ? 'opacity-100'
                                            : 'opacity-30'
                                    }`}
                                >
                                    <div
                                        className={`w-6 h-6 rounded-none border-2 border-black flex items-center justify-center text-xs font-bold ${
                                            galleryLoadingStep > step
                                                ? 'bg-green-400'
                                                : galleryLoadingStep === step
                                                  ? 'bg-[#FDC800] animate-pulse'
                                                  : 'bg-[#FBFBF9]'
                                        }`}
                                    >
                                        {galleryLoadingStep > step ? '✓' : step}
                                    </div>
                                    <span className="text-[#1C293C]">
                                        {GALLERY_STEP_LABELS[step]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {galleryPhase === 'CONSULTING_GALLERY' && (
                    <ProjectSelectionHub onJobQueued={onJobQueued} />
                )}

                {galleryPhase === 'FINALIZING' && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-[#1C293C]" />
                        <p className="font-bold text-[#1C293C] text-sm">
                            Generating your strategic CV…
                        </p>
                        <p className="text-xs text-[#4B5563]">
                            Gemini is rewriting your CV with the selected projects.
                        </p>
                    </div>
                )}

                {galleryPhase === 'ERROR' && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                        <p className="font-bold text-[#1C293C] text-sm">
                            Something went wrong
                        </p>
                        <p className="text-xs text-[#4B5563] max-w-sm">{galleryError}</p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="mt-2 px-4 py-2 rounded-none border-2 border-black bg-[#FDC800] text-sm font-bold text-[#1C293C] hover:opacity-80 transition-opacity"
                        >
                            Dismiss
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function WorkspacePage() {
    return (
        <Suspense>
            <WorkspacePageInner />
        </Suspense>
    )
}
