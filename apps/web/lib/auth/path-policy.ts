/** URL path prefixes that require a signed-in user (single source of truth). */
const PROTECTED_PREFIXES = ['/dashboard', '/workspace'] as const

export function isProtectedPath(pathname: string): boolean {
    return PROTECTED_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
}
