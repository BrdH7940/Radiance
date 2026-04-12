'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Sparkles,
    FolderOpen,
    History,
    LogOut,
    ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCVStore } from '@/store/useCVStore'

interface NavItem {
    label: string
    href: string
    icon: React.ElementType
    description: string
}

const NAV_ITEMS: NavItem[] = [
    {
        label: 'Enhance CV',
        href: '/dashboard',
        icon: Sparkles,
        description: 'Upload & analyze your CV',
    },
    {
        label: 'Project Gallery',
        href: '/dashboard/gallery',
        icon: FolderOpen,
        description: 'Manage your projects',
    },
    {
        label: 'CV History',
        href: '/dashboard/history',
        icon: History,
        description: 'Past enhancements',
    },
]

interface SidebarProps {
    userEmail?: string | null
    userInitial?: string
}

export function Sidebar({ userEmail, userInitial = '?' }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const { reset, setUser } = useCVStore()

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard'
        return pathname.startsWith(href)
    }

    const handleSignOut = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        reset()
        setUser(null)
        router.push('/login')
        router.refresh()
    }

    return (
        <aside className="flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-white/6 bg-midnight/80 backdrop-blur-sm">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/6">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-base font-black tracking-tight text-white">
                    Radiance
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                    const active = isActive(item.href)
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                                ${
                                    active
                                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                                }
                            `}
                        >
                            <Icon
                                className={`w-4 h-4 shrink-0 transition-colors ${
                                    active
                                        ? 'text-blue-400'
                                        : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="truncate">{item.label}</div>
                                <div
                                    className={`text-xs truncate mt-0.5 ${
                                        active ? 'text-blue-400/70' : 'text-slate-600'
                                    }`}
                                >
                                    {item.description}
                                </div>
                            </div>
                            {active && (
                                <ChevronRight className="w-3.5 h-3.5 text-blue-400/60 shrink-0" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* User profile + sign-out */}
            <div className="px-3 pb-4 border-t border-white/6 pt-3">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 font-medium truncate">
                            {userEmail ?? 'User'}
                        </p>
                        <p className="text-xs text-slate-600 truncate">
                            Signed in
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        title="Sign out"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200 shrink-0"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    )
}
