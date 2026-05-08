'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertCircle,
    Briefcase,
    Building2,
    Check,
    ChevronRight,
    History,
    Loader2,
    MoreHorizontal,
    Pencil,
    Trash2,
    X,
} from 'lucide-react'
import {
    type CVHistorySummary,
    deleteHistoryItem,
    getHistory,
    updateHistoryItem,
} from '@/services/historyApi'

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
            className={`inline-flex items-center px-2.5 py-1 rounded-none border-4 border-black text-xs font-bold tabular-nums ${color}`}
        >
            {score}%
        </span>
    )
}

// ─── History card ─────────────────────────────────────────────────────────────

interface HistoryCardProps {
    entry: CVHistorySummary
    onOpen: (id: string) => void
    onRename: (id: string, newTitle: string) => Promise<void>
    onDelete: (id: string) => Promise<void>
}

function HistoryCard({ entry, onOpen, onRename, onDelete }: HistoryCardProps) {
    const date = new Date(entry.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })

    const [menuOpen, setMenuOpen] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)
    const [renameValue, setRenameValue] = useState(entry.job_title ?? '')
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (isRenaming) {
            inputRef.current?.focus()
            inputRef.current?.select()
        }
    }, [isRenaming])

    useEffect(() => {
        if (!menuOpen) return
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [menuOpen])

    const startRename = (e: React.MouseEvent) => {
        e.stopPropagation()
        setMenuOpen(false)
        setRenameValue(entry.job_title ?? '')
        setError(null)
        setIsRenaming(true)
    }

    const cancelRename = (e?: React.MouseEvent | React.KeyboardEvent) => {
        e?.stopPropagation()
        setIsRenaming(false)
        setError(null)
    }

    const submitRename = async (e?: React.FormEvent | React.MouseEvent) => {
        e?.preventDefault()
        e?.stopPropagation()
        const next = renameValue.trim()
        if (!next || next === (entry.job_title ?? '')) {
            cancelRename()
            return
        }
        setIsSaving(true)
        setError(null)
        try {
            await onRename(entry.id, next)
            setIsRenaming(false)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to rename.')
        } finally {
            setIsSaving(false)
        }
    }

    const askDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        setMenuOpen(false)
        setError(null)
        setConfirmDelete(true)
    }

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        setConfirmDelete(false)
    }

    const confirmAndDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsDeleting(true)
        setError(null)
        try {
            await onDelete(entry.id)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to delete.')
            setIsDeleting(false)
            setConfirmDelete(false)
        }
    }

    const handleCardClick = () => {
        if (isRenaming || confirmDelete || menuOpen) return
        onOpen(entry.id)
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (isRenaming || confirmDelete || menuOpen) return
                    e.preventDefault()
                    onOpen(entry.id)
                }
            }}
            className="w-full text-left group rounded-none border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] p-5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#432DD7]"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        {isRenaming ? (
                            <form
                                onSubmit={submitRename}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-2 w-full"
                            >
                                <Briefcase className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') cancelRename(e)
                                    }}
                                    disabled={isSaving}
                                    placeholder="Job title"
                                    className="flex-1 min-w-0 px-2 py-1 rounded-none border-2 border-black bg-white text-sm font-semibold text-[#1C293C] focus:outline-none focus:ring-2 focus:ring-[#432DD7]"
                                />
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    title="Save"
                                    className="p-1.5 rounded-none border-2 border-black bg-[#FDC800] text-[#1C293C] hover:opacity-90 disabled:opacity-50"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Check className="w-3.5 h-3.5" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelRename}
                                    disabled={isSaving}
                                    title="Cancel"
                                    className="p-1.5 rounded-none border-2 border-black bg-[#FBFBF9] text-[#1C293C] hover:opacity-90 disabled:opacity-50"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </form>
                        ) : entry.job_title ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1C293C] truncate">
                                <Briefcase className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                {entry.job_title}
                            </span>
                        ) : (
                            <span className="text-sm font-semibold text-[#1C293C]">
                                Untitled analysis
                            </span>
                        )}
                    </div>

                    {entry.company_name && !isRenaming && (
                        <div className="flex items-center gap-1.5 mb-2">
                            <Building2 className="w-3 h-3 text-slate-600 shrink-0" />
                            <span className="text-xs text-[#4B5563] truncate">
                                {entry.company_name}
                            </span>
                        </div>
                    )}

                    <span className="text-xs text-[#4B5563]">{date}</span>

                    {error && (
                        <p className="mt-2 text-xs text-red-500">{error}</p>
                    )}
                </div>

                <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ScoreBadge score={entry.matching_score} />

                    {confirmDelete ? (
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={confirmAndDelete}
                                disabled={isDeleting}
                                title="Confirm delete"
                                className="p-1.5 rounded-none border-2 border-black bg-[#DC2626] text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {isDeleting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Check className="w-3.5 h-3.5" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={cancelDelete}
                                disabled={isDeleting}
                                title="Cancel"
                                className="p-1.5 rounded-none border-2 border-black bg-[#FBFBF9] text-[#1C293C] hover:opacity-90 disabled:opacity-50"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ) : (
                        <div ref={menuRef} className="relative">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setMenuOpen((v) => !v)
                                }}
                                title="More actions"
                                className="p-1.5 rounded-none border-2 border-transparent hover:border-black hover:bg-white text-[#1C293C] transition-colors"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-1 z-10 w-36 rounded-none border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    <button
                                        type="button"
                                        onClick={startRename}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-[#1C293C] hover:bg-[#FDC800] transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        Rename
                                    </button>
                                    <button
                                        type="button"
                                        onClick={askDelete}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 border-t-2 border-black transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {!isRenaming && !confirmDelete && (
                        <ChevronRight className="w-4 h-4 text-[#1C293C] group-hover:text-[#432DD7] group-hover:translate-x-0.5 transition-all" />
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CVHistory() {
    const router = useRouter()

    const [history, setHistory] = useState<CVHistorySummary[]>([])
    const [loading, setLoading] = useState(true)
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
        (id: string) => {
            router.push(`/workspace?id=${id}`)
        },
        [router]
    )

    const handleRename = useCallback(
        async (id: string, newTitle: string) => {
            const updated = await updateHistoryItem(id, { job_title: newTitle })
            setHistory((prev) =>
                prev.map((entry) =>
                    entry.id === id
                        ? { ...entry, job_title: updated.job_title ?? newTitle }
                        : entry
                )
            )
        },
        []
    )

    const handleDelete = useCallback(async (id: string) => {
        await deleteHistoryItem(id)
        setHistory((prev) => prev.filter((entry) => entry.id !== id))
    }, [])

    return (
        <div className="px-6 sm:px-8 pt-10 pb-20">
            {/* Header */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C293C] mb-2">
                    CV History
                </h1>
                <p className="text-[#4B5563] text-sm">
                    Browse your previous CV enhancements. Click any entry to restore it
                    in the workspace.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-none border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
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
                            className="rounded-none border-4 border-black bg-[#FBFBF9] p-5 h-20 animate-pulse"
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && history.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
                        <div className="p-4 rounded-none bg-[#FBFBF9] border-4 border-black mb-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <History className="w-8 h-8 text-slate-600" />
                    </div>
                        <h3 className="text-base font-semibold text-[#4B5563] mb-1">
                        No history yet
                    </h3>
                        <p className="text-sm text-[#4B5563] max-w-xs">
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
                            onRename={handleRename}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
