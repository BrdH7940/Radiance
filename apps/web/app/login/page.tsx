import { Suspense } from 'react'
import LoginClient from './login-client'

function LoginFallback() {
    return (
        <div className="min-h-screen bg-midnight flex items-center justify-center px-4 overflow-hidden">
            <div className="glow-blob w-[500px] h-[500px] -top-32 -left-32 bg-blue-700/15" />
            <div className="glow-blob w-[400px] h-[400px] bottom-0 -right-20 bg-violet-700/12" />
            <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />
            <div
                className="relative z-10 h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                aria-hidden
            />
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<LoginFallback />}>
            <LoginClient />
        </Suspense>
    )
}
