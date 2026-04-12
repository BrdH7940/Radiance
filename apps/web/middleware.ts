import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Next.js Middleware — runs at the edge before every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session cookie (keeps the JWT alive).
 * 2. Redirect unauthenticated users from protected routes to /login.
 * 3. Redirect already-authenticated users away from /login to /dashboard.
 */
export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: Record<string, unknown>) {
                    request.cookies.set({ name, value, ...(options as object) })
                    supabaseResponse = NextResponse.next({ request })
                    supabaseResponse.cookies.set({
                        name,
                        value,
                        ...(options as object),
                    })
                },
                remove(name: string, options: Record<string, unknown>) {
                    request.cookies.set({ name, value: '', ...(options as object) })
                    supabaseResponse = NextResponse.next({ request })
                    supabaseResponse.cookies.set({
                        name,
                        value: '',
                        ...(options as object),
                    })
                },
            },
        }
    )

    // Refreshes the session if it has expired — MUST be called before any
    // redirect logic so the updated cookie is forwarded to the browser.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // Redirect authenticated users away from the login page.
    if (user && pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Redirect unauthenticated users to the login page.
    const isProtected =
        pathname.startsWith('/dashboard') || pathname.startsWith('/workspace')

    if (!user && isProtected) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('next', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        /*
         * Run middleware on all paths EXCEPT Next.js internals and static assets.
         * This ensures session cookies are refreshed on every page navigation.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
