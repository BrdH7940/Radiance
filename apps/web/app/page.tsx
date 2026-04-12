import { redirect } from 'next/navigation'

/**
 * Root page — redirects to the main dashboard.
 * The middleware handles the auth check, so unauthenticated users will be
 * redirected to /login before ever reaching the dashboard.
 */
export default function RootPage() {
    redirect('/dashboard')
}
