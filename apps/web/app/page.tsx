'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Static export: client redirect from `/` to the main app shell. */
export default function RootPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/dashboard')
    }, [router])

    return (
        <div className="min-h-screen bg-midnight flex items-center justify-center">
            <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                aria-hidden
            />
        </div>
    )
}
