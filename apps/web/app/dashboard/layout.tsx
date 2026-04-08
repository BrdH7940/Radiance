import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/Sidebar'

/**
 * Server Component layout wrapping all /dashboard/* routes.
 *
 * Verifies the session server-side (belt-and-suspenders alongside middleware).
 * Passes user display info to the Sidebar as props to avoid an extra client fetch.
 */
export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const userEmail = user.email ?? null
    const userInitial = userEmail
        ? userEmail[0].toUpperCase()
        : (user.user_metadata?.full_name?.[0] ?? '?').toUpperCase()

    return (
        <div className="flex min-h-screen bg-midnight">
            {/* Persistent background effects */}
            <div className="glow-blob w-[500px] h-[500px] -top-32 -left-32 bg-blue-700/10 pointer-events-none" />
            <div className="glow-blob w-[400px] h-[400px] top-1/2 -right-20 bg-violet-700/8 pointer-events-none" />
            <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />

            <Sidebar userEmail={userEmail} userInitial={userInitial} />

            <main className="relative z-10 flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}
