'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { CVHistory } from '@/components/dashboard/CVHistory'

function HistoryPageInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const id = searchParams.get('id')

    // Backwards-compatible redirect: legacy /dashboard/history?id=… now points to
    // /workspace?id=… so the history detail view IS the workspace editor (with
    // gallery, render PDF, JSON / PDF download, etc.).
    useEffect(() => {
        if (id) router.replace(`/workspace?id=${id}`)
    }, [id, router])

    if (id) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#FBFBF9] text-[#1C293C]">
                <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1C293C]" />
                    <p className="font-bold text-sm">Opening editor…</p>
                </div>
            </div>
        )
    }

    return <CVHistory />
}

export default function HistoryPage() {
    return (
        <Suspense>
            <HistoryPageInner />
        </Suspense>
    )
}
