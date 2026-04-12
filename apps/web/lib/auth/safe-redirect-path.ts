/**
 * Allow only same-origin relative paths to prevent open redirects.
 */
export function sanitizeNextPath(
    next: string | null | undefined,
    fallback: string
): string {
    if (
        typeof next === 'string' &&
        next.startsWith('/') &&
        !next.startsWith('//')
    ) {
        return next
    }
    return fallback
}
