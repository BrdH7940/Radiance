'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isProtectedPath } from '@/lib/auth/path-policy'
import { useCVStore } from '@/store/useCVStore'

/**
 * Client-side gate for static export: redirects unauthenticated users
 * away from protected routes after session hydration.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const user = useCVStore((s) => s.user)
    const authHydrated = useCVStore((s) => s.authHydrated)

    useEffect(() => {
        if (!authHydrated) return
        if (!user && isProtectedPath(pathname)) {
            const next = encodeURIComponent(pathname)
            router.replace(`/login?next=${next}`)
        }
    }, [authHydrated, user, pathname, router])

    if (!authHydrated) {
        return (
            <div className="min-h-screen bg-midnight flex items-center justify-center">
                <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                    aria-hidden
                />
            </div>
        )
    }

    if (!user && isProtectedPath(pathname)) {
        return null
    }

    return <>{children}</>
}
