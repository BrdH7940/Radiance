'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Mail, Lock, Chrome, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath } from '@/lib/auth/safe-redirect-path'
import { useCVStore } from '@/store/useCVStore'

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
        <div className="min-h-screen bg-midnight flex items-center justify-center px-4 overflow-hidden">
            {/* Background effects */}
            <div className="glow-blob w-[500px] h-[500px] -top-32 -left-32 bg-blue-700/15" />
            <div className="glow-blob w-[400px] h-[400px] bottom-0 -right-20 bg-violet-700/12" />
            <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />

            <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="inline-flex items-center gap-2.5 mb-4">
                        <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20">
                            <Sparkles className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="text-xl font-black tracking-tight text-white">
                            Radiance
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-white text-center">
                        {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                    </h1>
                    <p className="text-slate-400 text-sm mt-1 text-center">
                        {mode === 'signin'
                            ? 'Sign in to enhance your career.'
                            : 'Start closing the gap between you and your dream role.'}
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-8">
                    {/* Error / Success messages */}
                    {error && (
                        <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl border border-red-500/30 bg-red-500/5 animate-in fade-in duration-300">
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}
                    {message && (
                        <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 animate-in fade-in duration-300">
                            <p className="text-sm text-emerald-400">{message}</p>
                        </div>
                    )}

                    {/* Google OAuth */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={googleLoading || loading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white text-sm font-medium hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-5"
                    >
                        {googleLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Chrome className="w-4 h-4" />
                        )}
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="relative flex items-center gap-3 mb-5">
                        <div className="flex-1 h-px bg-white/8" />
                        <span className="text-slate-600 text-xs">or</span>
                        <div className="flex-1 h-px bg-white/8" />
                    </div>

                    {/* Email / Password Form */}
                    <form onSubmit={handleEmailAuth} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    minLength={6}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all duration-200"
                                />
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading || googleLoading}
                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white text-sm font-bold shadow-lg shadow-blue-900/30 hover:brightness-110 hover:shadow-blue-800/40 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:brightness-100 mt-1"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {mode === 'signin' ? 'Sign in' : 'Create account'}
                        </button>
                    </form>

                    {/* Toggle mode */}
                    <p className="text-center text-sm text-slate-500 mt-5">
                        {mode === 'signin' ? (
                            <>
                                Don&apos;t have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('signup')
                                        setError(null)
                                        setMessage(null)
                                    }}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    Sign up
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('signin')
                                        setError(null)
                                        setMessage(null)
                                    }}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                                >
                                    Sign in
                                </button>
                            </>
                        )}
                    </p>
                </div>
            </div>
        </div>
    )
}
