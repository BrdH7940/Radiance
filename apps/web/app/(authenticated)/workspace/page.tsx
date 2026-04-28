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
} from 'lucide-react'
import { NavBar } from '@/components/ui/NavBar'
import { CVFormBuilder } from '@/components/editor/CVFormBuilder'
import { CVPreview } from '@/components/editor/CVPreview'
import { useCVStore } from '@/store/useCVStore'
import { renderCvToPdf } from '@/services/api'
import type { CVResumeSchema } from '@/services/api'

// ─── Notification ─────────────────────────────────────────────────────────────

type NotificationType = 'success' | 'error' | 'info'

interface Notification {
    id: number
    message: string
    type: NotificationType
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function WorkspacePageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const historyId = searchParams.get('id')

    const {
        cvData,
        setCvData,
        pdfUrl,
        setPdfUrl,
        setPhase,
        setInputReviewMode,
        selectedProjectIds,
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

    // ── Guard ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!cvData) router.replace('/')
    }, [cvData, router])

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

    const handleStepClick = useCallback(
        (step: number) => {
            if (historyId) {
                if (step === 1) {
                    router.push('/dashboard/history')
                    return
                }
                if (step === 2) {
                    router.push(`/dashboard/history?id=${historyId}`)
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

    if (!cvData) return null

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

export default function WorkspacePage() {
    return (
        <Suspense>
            <WorkspacePageInner />
        </Suspense>
    )
}
