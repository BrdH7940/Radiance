import { Sidebar } from '@/components/dashboard/Sidebar'

/**
 * Layout for /dashboard/* (static export). Auth is enforced by RequireAuth
 * in the parent route group; Sidebar reads the user from the client store.
 */
export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="flex min-h-screen bg-[#FBFBF9] text-[#1C293C] selection:bg-[#432DD7] selection:text-white">
            <div className="glow-blob w-[500px] h-[500px] -top-32 -left-32 bg-blue-700/10 pointer-events-none" />
            <div className="glow-blob w-[400px] h-[400px] top-1/2 -right-20 bg-violet-700/8 pointer-events-none" />
            <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />

            <Sidebar />

            <main className="relative z-10 flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}
