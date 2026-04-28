'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCVStore } from '@/store/useCVStore'

/**
 * Invisible client component mounted in the root layout.
 *
 * Syncs the Supabase auth session into the Zustand store so that
 * all client components can access the current user via useCVStore().
 */
export function SupabaseAuthListener() {
    const { setUser, setAuthHydrated } = useCVStore()

    useEffect(() => {
        const supabase = createClient()

        // Hydrate the store with the current session on mount.
        supabase.auth
            .getUser()
            .then(({ data: { user } }) => {
                setUser(user)
            })
            .finally(() => {
                setAuthHydrated(true)
            })

        // Subscribe to future auth state changes.
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [setUser, setAuthHydrated])

    return null
}
