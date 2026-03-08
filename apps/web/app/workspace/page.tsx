'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Download,
    FileJson,
    Zap,
    ChevronLeft,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    SplitSquareHorizontal,
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

export default function WorkspacePage() {
    const router = useRouter()
    const { cvData, setCvData, pdfUrl, setPdfUrl } = useCVStore()

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

    if (!cvData) return null

    // ── Notification helpers ──────────────────────────────────────────────────

    const showNotification = useCallback(
        (message: string, type: NotificationType = 'success') => {
            const id = ++notifIdRef.current
            setNotifications((prev) => [...prev, { id, message, type }])
            setTimeout(
                () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
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
        const blob = new Blob([JSON.stringify(cvData, null, 2)], { type: 'application/json' })
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
            showNotification('Render the PDF first using the "Render PDF" button.', 'error')
        }
    }, [pdfUrl, showNotification])

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-midnight">
            <NavBar activeStep={3} />

            {/* ── Toolbar ──────────────────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-midnight/80 backdrop-blur-xl">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 text-xs font-medium hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Upload
                </button>

                <div className="h-4 w-px bg-white/8" />

                <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                    <SplitSquareHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:block">CV Editor</span>
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    {/* Render PDF */}
                    <button
                        onClick={handleRenderPdf}
                        disabled={isRendering}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 hover:border-indigo-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRendering ? 'animate-spin' : ''}`} />
                        {isRendering ? 'Rendering…' : 'Render PDF'}
                    </button>

                    {/* Export JSON */}
                    <button
                        onClick={handleDownloadJson}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8 transition-all duration-300"
                    >
                        <FileJson className="w-3.5 h-3.5" />
                        JSON
                    </button>

                    {/* Download PDF */}
                    <button
                        onClick={handleDownloadPDF}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8 transition-all duration-300"
                    >
                        <Download className="w-3.5 h-3.5" />
                        PDF
                    </button>

                    {/* AI indicator */}
                    <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5">
                        <Zap className="w-3 h-3 text-violet-400" strokeWidth={2.5} />
                        <span className="text-xs text-violet-400 font-medium">AI Ready</span>
                    </div>
                </div>
            </div>

            {/* ── Split pane ──────────────────────────────────────────────────── */}
            <div ref={splitPaneRef} className="flex-1 flex overflow-hidden min-h-0">
                {/* Left — Form Builder */}
                <div
                    className="flex flex-col border-r border-white/5 min-w-0 flex-none bg-[#05070a]"
                    style={{ width: `${leftPaneWidth}%` }}
                >
                    <div className="shrink-0 flex items-center px-4 py-2 border-b border-white/5">
                        <span className="text-sm text-slate-600 font-medium">Edit CV</span>
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CVFormBuilder cvData={cvData} onChange={handleCvChange} />
                    </div>
                </div>

                {/* Resize handle */}
                <div
                    onMouseDown={handleResizeMouseDown}
                    className={`flex-none w-1 cursor-col-resize bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors ${isResizing ? 'bg-indigo-500' : ''}`}
                />

                {/* Right — Preview */}
                <div className="flex-1 flex flex-col min-w-0">
                    <CVPreview cvData={cvData} pdfUrl={pdfUrl} isRendering={isRendering} />
                </div>
            </div>

            {/* ── Toast notifications ─────────────────────────────────────────── */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
                {notifications.map((n) => (
                    <div
                        key={n.id}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-sm font-medium shadow-xl animate-in slide-in-from-bottom-8 fade-in duration-300 ${
                            n.type === 'success'
                                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
                                : n.type === 'error'
                                  ? 'bg-red-950/90 border-red-500/30 text-red-300'
                                  : 'bg-slate-900/90 border-white/10 text-slate-300'
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
