import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * OAuth callback handler for Supabase social logins (Google, etc.).
 *
 * Supabase redirects here with a `code` param after the provider completes.
 * We exchange the code for a session and then redirect to the intended page.
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (code) {
        const cookieStore = cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value
                    },
                    set(name: string, value: string, options: Record<string, unknown>) {
                        cookieStore.set({ name, value, ...(options as object) })
                    },
                    remove(name: string, options: Record<string, unknown>) {
                        cookieStore.set({ name, value: '', ...(options as object) })
                    },
                },
            }
        )

        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            // Validate `next` to prevent open redirect attacks.
            // Only allow relative paths that start with exactly one `/`.
            const safePath =
                typeof next === 'string' &&
                next.startsWith('/') &&
                !next.startsWith('//')
                    ? next
                    : '/dashboard'
            return NextResponse.redirect(`${origin}${safePath}`)
        }
    }

    // If code exchange fails, send back to login with an error hint.
    return NextResponse.redirect(`${origin}/login?error=oauth_callback_failed`)
}
