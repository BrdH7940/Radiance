import { RequireAuth } from '@/components/auth/RequireAuth'

export default function AuthenticatedLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return <RequireAuth>{children}</RequireAuth>
}
