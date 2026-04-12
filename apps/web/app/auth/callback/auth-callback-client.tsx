'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath } from '@/lib/auth/safe-redirect-path'

export default function AuthCallbackClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        const code = searchParams.get('code')
        const next = sanitizeNextPath(searchParams.get('next'), '/dashboard')

        if (!code) {
            setFailed(true)
            router.replace('/login?error=oauth_callback_failed')
            return
        }

        const supabase = createClient()
        void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
            if (error) {
                setFailed(true)
                router.replace('/login?error=oauth_callback_failed')
                return
            }
            router.replace(next)
        })
    }, [router, searchParams])

    if (failed) return null

    return (
        <div className="min-h-screen bg-midnight flex items-center justify-center">
            <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                aria-hidden
            />
        </div>
    )
}
