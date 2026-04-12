import { Suspense } from 'react'
import AuthCallbackClient from './auth-callback-client'

function CallbackFallback() {
    return (
        <div className="min-h-screen bg-midnight flex items-center justify-center">
            <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
                aria-hidden
            />
        </div>
    )
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={<CallbackFallback />}>
            <AuthCallbackClient />
        </Suspense>
    )
}
