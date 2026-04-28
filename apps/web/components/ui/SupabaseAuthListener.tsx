'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCVStore } from '@/store/useCVStore'

/**
 * Invisible client component mounted in the root layout.
 *
 * Syncs the Supabase auth session into the Zustand store so that
 * all client components can access the current user via useCVStore().
 *
 * React Strict Mode (dev) mounts → unmounts → remounts every component.
 * Without a guard, `getUser()` is called twice concurrently — both calls race
 * for the same IndexedDB auth lock and one gets an "orphaned lock" warning.
 *
 * Fix: a module-level flag (`_hydrated`) ensures `getUser()` is called at most
 * once per page session regardless of how many times React mounts this component.
 * The auth-state subscription is managed per-mount via useRef so cleanup is
 * always correct.
 */

// Module-level: survives remounts within the same browser session.
let _hydrated = false

export function SupabaseAuthListener() {
    const { setUser, setAuthHydrated } = useCVStore()
    // Tracks whether THIS mount has registered a subscription (for cleanup).
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null)

    useEffect(() => {
        const supabase = createClient()

        // Hydrate store once — skip if a previous mount already did it.
        if (!_hydrated) {
            _hydrated = true
            supabase.auth
                .getUser()
                .then(({ data: { user } }) => {
                    setUser(user)
                })
                .finally(() => {
                    setAuthHydrated(true)
                })
        }

        // Always register the auth-state listener so live sign-in/out events
        // are captured even after Strict Mode's remount cycle.
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        subscriptionRef.current = subscription

        return () => {
            subscription.unsubscribe()
            subscriptionRef.current = null
        }
    }, [setUser, setAuthHydrated])

    return null
}
