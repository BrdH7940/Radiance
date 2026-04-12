import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes cookies via Next.js `cookies()`.
 */
export function createClient() {
    const cookieStore = cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: Record<string, unknown>) {
                    try {
                        cookieStore.set({ name, value, ...options })
                    } catch {
                        // set() throws when called from a Server Component
                        // (read-only context). The middleware handles the refresh,
                        // so this is safe to swallow here.
                    }
                },
                remove(name: string, options: Record<string, unknown>) {
                    try {
                        cookieStore.set({ name, value: '', ...options })
                    } catch {
                        // Same as above.
                    }
                },
            },
        }
    )
}
