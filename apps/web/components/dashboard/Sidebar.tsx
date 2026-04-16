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

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { reset, setUser, user } = useCVStore()

    const userEmail = user?.email ?? null
    const userInitial = userEmail
        ? userEmail[0].toUpperCase()
        : (user?.user_metadata?.full_name?.[0] ?? '?').toString().toUpperCase()

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
        <aside className="flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r-4 border-black bg-[#FBFBF9]">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 py-5 border-b-4 border-black">
                <div className="p-1.5 rounded-none bg-[#FDC800] border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    <Sparkles className="w-4 h-4 text-black" />
                </div>
                <span className="text-base font-black tracking-tight text-[#1C293C]">
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
                                group flex items-center gap-3 px-3 py-2.5 rounded-none text-sm font-medium transition-all duration-200 border-4 border-black
                                ${
                                    active
                                        ? 'bg-[#432DD7] text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                                        : 'bg-[#FBFBF9] text-[#1C293C] hover:text-[#1C293C] hover:bg-[#FDC800]'
                                }
                            `}
                        >
                            <Icon
                                className={`w-4 h-4 shrink-0 transition-colors ${
                                    active
                                        ? 'text-[#FDC800]'
                                        : 'text-[#1C293C] group-hover:text-[#1C293C]'
                                }`}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="truncate">{item.label}</div>
                                <div
                                    className={`text-xs truncate mt-0.5 ${
                                        active ? 'text-[#FDC800]' : 'text-[#1C293C]'
                                    }`}
                                >
                                    {item.description}
                                </div>
                            </div>
                            {active && (
                                <ChevronRight className="w-3.5 h-3.5 text-[#FDC800] shrink-0" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* User profile + sign-out */}
            <div className="px-3 pb-4 border-t-4 border-black pt-3">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-none border-4 border-black bg-white">
                    <div className="w-8 h-8 rounded-none bg-[#FDC800] flex items-center justify-center text-[#1C293C] text-xs font-bold shrink-0 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                        {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#1C293C] font-medium truncate">
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
                        className="p-1.5 rounded-none text-slate-600 hover:text-red-600 hover:bg-red-400/10 transition-all duration-200 border-4 border-black shrink-0"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    )
}
