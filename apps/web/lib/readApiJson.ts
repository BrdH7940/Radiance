/**
 * Parse fetch() response bodies as JSON with actionable errors when the server
 * returns HTML (wrong base URL, CDN error page, etc.).
 */
export function fastApiErrorDetail(data: unknown): string | null {
    if (!data || typeof data !== 'object' || !('detail' in data)) return null
    const d = (data as { detail: unknown }).detail
    if (typeof d === 'string' || typeof d === 'number') return String(d)
    return null
}

export async function readApiJson<T>(res: Response): Promise<T> {
    const text = await res.text()
    if (!text.trim()) {
        return undefined as T
    }
    try {
        return JSON.parse(text) as T
    } catch {
        const startsWithHtml = text.trimStart().startsWith('<')
        const hint = startsWithHtml
            ? ' The response looks like HTML. Set NEXT_PUBLIC_API_URL to your API Gateway/backend base URL (not the CloudFront or static site URL).'
            : ''
        throw new Error(`Invalid JSON from API (${res.status}).${hint}`)
    }
}
