'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ChevronLeft,
    AlertCircle,
    Briefcase,
    Building2,
    SplitSquareHorizontal,
} from 'lucide-react'
import { AnalysisDashboard } from '@/components/dashboard/AnalysisDashboard'
import { useCVStore } from '@/store/useCVStore'
import { type CVHistoryEntry, getHistoryItem } from '@/services/historyApi'
import type { CVResumeSchema } from '@/services/api'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-8 w-64 rounded-none border-4 border-black bg-black/10" />
            <div className="h-48 rounded-none border-4 border-black bg-black/10" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-40 rounded-none border-4 border-black bg-black/10" />
                <div className="h-40 rounded-none border-4 border-black bg-black/10" />
            </div>
        </div>
    )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CVHistoryDetailProps {
    id: string
}

export function CVHistoryDetail({ id }: CVHistoryDetailProps) {
    const router = useRouter()
    const { setCvData, setPdfUrl, setAnalysisResult, setPhase } = useCVStore()

    const [entry, setEntry] = useState<CVHistoryEntry | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            setLoading(true)
            setError(null)
            try {
                const data = await getHistoryItem(id)
                setEntry(data)
            } catch (err: unknown) {
                setError(
                    err instanceof Error ? err.message : 'Failed to load history entry.'
                )
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [id])

    const handleOpenInWorkspace = useCallback(() => {
        if (!entry?.enhanced_cv_json) return
        const cvData = entry.enhanced_cv_json as CVResumeSchema
        setCvData(cvData)
        setPdfUrl('')
        setAnalysisResult({
            matching_score: entry.matching_score ?? 0,
            missing_skills: [],
            red_flags: [],
            enhanced_cv_json: cvData,
            pdf_url: '',
        })
        setPhase('workspace')
        router.push(`/workspace?id=${id}`)
    }, [entry, id, setCvData, setPdfUrl, setAnalysisResult, setPhase, router])

    const date = entry
        ? new Date(entry.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
          })
        : null

    return (
        <div className="px-6 sm:px-8 pt-10 pb-20">
            {/* Header */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <button
                    type="button"
                    onClick={() => router.push('/dashboard/history')}
                    className="inline-flex items-center gap-1.5 mb-6 px-3 py-1.5 rounded-none border-4 border-black bg-[#FBFBF9] text-[#1C293C] text-sm font-medium shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all duration-200"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back to History
                </button>

                {entry && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            {entry.job_title ? (
                                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C293C] flex items-center gap-2 mb-1">
                                    <Briefcase className="w-7 h-7 text-blue-400 shrink-0" />
                                    {entry.job_title}
                                </h1>
                            ) : (
                                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C293C] mb-1">
                                    Untitled analysis
                                </h1>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                                {entry.company_name && (
                                    <span className="flex items-center gap-1.5 text-sm text-[#4B5563]">
                                        <Building2 className="w-3.5 h-3.5" />
                                        {entry.company_name}
                                    </span>
                                )}
                                {date && (
                                    <span className="text-sm text-[#4B5563]">{date}</span>
                                )}
                            </div>
                        </div>

                        {entry.enhanced_cv_json && (
                            <button
                                type="button"
                                onClick={handleOpenInWorkspace}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-none border-4 border-black bg-[#432DD7] text-white text-sm font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all duration-200 self-start sm:self-auto"
                            >
                                <SplitSquareHorizontal className="w-4 h-4" />
                                Open in Workspace
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-none border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Loading */}
            {loading && <LoadingSkeleton />}

            {/* Analysis */}
            {!loading && entry && (
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-500">
                    <AnalysisDashboard
                        result={{
                            matching_score: entry.matching_score ?? 0,
                            missing_skills: [],
                            red_flags: [],
                            enhanced_cv_json: entry.enhanced_cv_json ?? ({} as CVResumeSchema),
                            pdf_url: '',
                        }}
                        onEnhanceWithAI={handleOpenInWorkspace}
                    />
                </div>
            )}
        </div>
    )
}
