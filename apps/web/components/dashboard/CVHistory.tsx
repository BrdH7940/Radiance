'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { History, AlertCircle, ChevronRight, Building2, Briefcase } from 'lucide-react'
import { useState } from 'react'
import { type CVHistoryEntry, type CVHistorySummary, getHistory, getHistoryItem } from '@/services/historyApi'
import { useCVStore } from '@/store/useCVStore'
import type { CVResumeSchema } from '@/services/api'

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) return null
    const color =
        score >= 75
            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8'
            : score >= 50
              ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
              : 'text-red-400 border-red-500/30 bg-red-500/8'

    return (
        <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold tabular-nums ${color}`}
        >
            {score}%
        </span>
    )
}

// ─── History card ─────────────────────────────────────────────────────────────

interface HistoryCardProps {
    entry: CVHistorySummary
    onOpen: (id: string) => void
    loading: boolean
}

function HistoryCard({ entry, onOpen, loading }: HistoryCardProps) {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })

    return (
        <button
            type="button"
            onClick={() => onOpen(entry.id)}
            disabled={loading}
            className="w-full text-left group rounded-2xl border border-white/8 bg-white/2 hover:bg-white/5 hover:border-white/14 p-5 transition-all duration-200 disabled:opacity-60"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        {entry.job_title ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white truncate">
                                <Briefcase className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                {entry.job_title}
                            </span>
                        ) : (
                            <span className="text-sm font-semibold text-slate-500">
                                Untitled analysis
                            </span>
                        )}
                    </div>

                    {entry.company_name && (
                        <div className="flex items-center gap-1.5 mb-2">
                            <Building2 className="w-3 h-3 text-slate-600 shrink-0" />
                            <span className="text-xs text-slate-500 truncate">
                                {entry.company_name}
                            </span>
                        </div>
                    )}

                    <span className="text-xs text-slate-700">{date}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <ScoreBadge score={entry.matching_score} />
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
                </div>
            </div>
        </button>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CVHistory() {
    const router = useRouter()
    const { setCvData, setPdfUrl, setPhase, setAnalysisResult } = useCVStore()

    const [history, setHistory] = useState<CVHistorySummary[]>([])
    const [loading, setLoading] = useState(true)
    const [openingId, setOpeningId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const fetchHistory = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getHistory()
            setHistory(data)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load history.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHistory()
    }, [fetchHistory])

    const handleOpen = useCallback(
        async (id: string) => {
            setOpeningId(id)
            try {
                const entry: CVHistoryEntry = await getHistoryItem(id)

                if (entry.enhanced_cv_json) {
                    const cvData = entry.enhanced_cv_json as CVResumeSchema

                    // Restore workspace state from the history entry.
                    setCvData(cvData)
                    setPdfUrl('')

                    // Restore a minimal analysisResult so the dashboard phase renders.
                    setAnalysisResult({
                        matching_score: entry.matching_score ?? 0,
                        missing_skills: [],
                        red_flags: [],
                        enhanced_cv_json: cvData,
                        pdf_url: '',
                    })

                    setPhase('workspace')
                    router.push('/workspace')
                }
            } catch (err: unknown) {
                setError(
                    err instanceof Error ? err.message : 'Failed to open history entry.'
                )
            } finally {
                setOpeningId(null)
            }
        },
        [setCvData, setPdfUrl, setAnalysisResult, setPhase, router]
    )

    return (
        <div className="px-6 sm:px-8 pt-10 pb-20">
            {/* Header */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
                    CV History
                </h1>
                <p className="text-slate-400 text-sm">
                    Browse your previous CV enhancements. Click any entry to restore it
                    in the workspace.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl border border-red-500/30 bg-red-500/5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl border border-white/8 bg-white/2 p-5 h-20 animate-pulse"
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && history.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
                    <div className="p-4 rounded-2xl bg-white/3 border border-white/8 mb-4">
                        <History className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-400 mb-1">
                        No history yet
                    </h3>
                    <p className="text-sm text-slate-600 max-w-xs">
                        Your CV enhancements will appear here once you complete an
                        analysis.
                    </p>
                </div>
            )}

            {/* History list */}
            {!loading && history.length > 0 && (
                <div className="space-y-3 animate-in fade-in duration-500">
                    {history.map((entry) => (
                        <HistoryCard
                            key={entry.id}
                            entry={entry}
                            onOpen={handleOpen}
                            loading={openingId === entry.id}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
