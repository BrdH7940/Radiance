'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Chrome, AlertCircle, Loader2, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath } from '@/lib/auth/safe-redirect-path'
import { useCVStore } from '@/store/useCVStore'

interface GhostButtonProps {
    children: React.ReactNode
    onClick?: () => void
    type?: 'button' | 'submit'
    disabled?: boolean
    className?: string
}

function GhostButton({ children, onClick, type = 'button', disabled = false, className = '' }: GhostButtonProps) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`px-8 py-4 rounded-full border border-[rgba(240,240,250,0.35)] bg-[rgba(240,240,250,0.1)]
                       text-[#f0f0fa] uppercase tracking-[1.17px] font-bold text-[13px]
                       hover:bg-[rgba(240,240,250,0.2)] hover:border-[#f0f0fa] transition-all duration-300
                       disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
            {children}
        </button>
    )
}

export default function LoginClient() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextPath = sanitizeNextPath(searchParams.get('next'), '/dashboard')
    const user = useCVStore((s) => s.user)
    const authHydrated = useCVStore((s) => s.authHydrated)

    const [mode, setMode] = useState<'signin' | 'signup'>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [googleLoading, setGoogleLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const supabase = createClient()

    useEffect(() => {
        if (!authHydrated || !user) return
        router.replace(nextPath)
    }, [authHydrated, user, nextPath, router])

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setMessage(null)
        setLoading(true)

        try {
            if (mode === 'signup') {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/dashboard` },
                })
                if (signUpError) throw signUpError
                setMessage('Check your email to confirm your account.')
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (signInError) throw signInError
                router.push(nextPath)
                router.refresh()
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Authentication failed.')
        } finally {
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setError(null)
        setGoogleLoading(true)
        try {
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
                },
            })
            if (oauthError) throw oauthError
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Google sign-in failed.')
            setGoogleLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#000000] text-[#f0f0fa] flex flex-col items-center justify-center p-6 font-sans">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full max-w-md space-y-8"
            >
                {/* Header */}
                <div className="text-center space-y-3">
                    <div className="flex justify-center mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-sm flex items-center justify-center">
                            <Zap size={20} fill="white" color="white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold tracking-[4px] uppercase">Radiance</h1>
                    <p className="text-[12px] tracking-[1px] text-indigo-300 uppercase">Mission Control Access</p>
                </div>

                {/* Error / Success messages */}
                {error && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5">
                        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}
                {message && (
                    <div className="px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                        <p className="text-sm text-emerald-400">{message}</p>
                    </div>
                )}

                {/* Form */}
                <div className="space-y-6">
                    {/* Google OAuth */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={googleLoading || loading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full border border-[rgba(240,240,250,0.35)] bg-[rgba(240,240,250,0.05)] text-[#f0f0fa] text-[13px] font-bold uppercase tracking-[1.17px] hover:bg-[rgba(240,240,250,0.15)] hover:border-[#f0f0fa] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Chrome className="w-4 h-4" />
                        )}
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="relative flex items-center gap-3">
                        <div className="flex-1 h-px bg-[#f0f0fa]/10" />
                        <span className="text-[10px] uppercase tracking-[2px] opacity-40">or</span>
                        <div className="flex-1 h-px bg-[#f0f0fa]/10" />
                    </div>

                    {/* Email / Password */}
                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-[2px] block opacity-70">
                                Identifier
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="EMAIL"
                                className="w-full bg-transparent border-b border-[#f0f0fa]/30 py-2 focus:outline-none focus:border-indigo-500 transition-colors text-sm placeholder:text-[#f0f0fa]/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-[2px] block opacity-70">
                                Security Key
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="PASSWORD"
                                minLength={6}
                                className="w-full bg-transparent border-b border-[#f0f0fa]/30 py-2 focus:outline-none focus:border-indigo-500 transition-colors text-sm placeholder:text-[#f0f0fa]/30"
                            />
                        </div>
                        <GhostButton type="submit" disabled={loading || googleLoading} className="w-full">
                            {loading && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}
                            {mode === 'signin' ? 'Initiate Session' : 'Create Account'}
                        </GhostButton>
                    </form>

                    {/* Toggle sign in / sign up */}
                    <p className="text-center text-[11px] uppercase tracking-[1px] opacity-50">
                        {mode === 'signin' ? (
                            <>
                                No account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('signup'); setError(null); setMessage(null) }}
                                    className="text-indigo-400 hover:text-indigo-300 transition-colors font-bold"
                                >
                                    Register
                                </button>
                            </>
                        ) : (
                            <>
                                Have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('signin'); setError(null); setMessage(null) }}
                                    className="text-indigo-400 hover:text-indigo-300 transition-colors font-bold"
                                >
                                    Sign in
                                </button>
                            </>
                        )}
                    </p>
                </div>

                {/* Back to landing */}
                <button
                    type="button"
                    onClick={() => router.push('/')}
                    className="w-full text-[10px] uppercase tracking-[2px] opacity-40 hover:opacity-100 transition-opacity text-center"
                >
                    Abort and return
                </button>
            </motion.div>
        </div>
    )
}
