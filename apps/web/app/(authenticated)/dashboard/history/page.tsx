'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CVHistory } from '@/components/dashboard/CVHistory'
import { CVHistoryDetail } from '@/components/dashboard/CVHistoryDetail'

function HistoryPageInner() {
    const searchParams = useSearchParams()
    const id = searchParams.get('id')

    if (id) return <CVHistoryDetail id={id} />
    return <CVHistory />
}

export default function HistoryPage() {
    return (
        <Suspense>
            <HistoryPageInner />
        </Suspense>
    )
}
