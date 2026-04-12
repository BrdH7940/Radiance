/**
 * Parse fetch() response bodies as JSON with actionable errors when the server
 * returns HTML (wrong base URL, CDN error page) or plain text (some API Gateway errors).
 */

const BODY_PREVIEW_CHARS = 280

function oneLinePreview(text: string): string {
    const t = text.replace(/\s+/g, ' ').trim()
    if (t.length <= BODY_PREVIEW_CHARS) return t
    return `${t.slice(0, BODY_PREVIEW_CHARS)}…`
}

/** FastAPI uses `detail`; API Gateway HTTP API often uses `message`. */
export function extractApiErrorMessage(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const o = data as Record<string, unknown>
    if (typeof o.detail === 'string' || typeof o.detail === 'number') return String(o.detail)
    if (typeof o.message === 'string') return o.message
    return null
}

/** @deprecated Use extractApiErrorMessage */
export const fastApiErrorDetail = extractApiErrorMessage

export async function readApiJson<T>(res: Response): Promise<T> {
    const text = await res.text()

    if (process.env.NEXT_PUBLIC_DEBUG_API === '1' && typeof console !== 'undefined') {
        console.info('[readApiJson]', res.url, res.status, text.length, 'chars')
    }

    const trimmed = text.replace(/^\uFEFF/, '').trim()
    if (!trimmed) {
        return undefined as T
    }

    try {
        return JSON.parse(trimmed) as T
    } catch {
        const startsWithHtml = trimmed.trimStart().startsWith('<')
        const hint = startsWithHtml
            ? ' Body looks like HTML (wrong URL, or HTML error page from a proxy).'
            : ' Body is not valid JSON (often plain text from API Gateway/Lambda).'
        const preview = oneLinePreview(trimmed)
        throw new Error(
            `Invalid JSON from API (${res.status}).${hint} Preview: ${JSON.stringify(preview)} — open DevTools → Network → the failing request → Response, or curl the same URL with your Bearer token.`
        )
    }
}
