import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractApiErrorMessage, readApiJson } from '@/lib/readApiJson'

// ─── extractApiErrorMessage ───────────────────────────────────────────────────

describe('extractApiErrorMessage', () => {
    it('extracts string detail field (FastAPI style)', () => {
        expect(extractApiErrorMessage({ detail: 'Not found' })).toBe('Not found')
    })

    it('extracts numeric detail and coerces to string', () => {
        expect(extractApiErrorMessage({ detail: 404 })).toBe('404')
    })

    it('extracts message field (API Gateway style)', () => {
        expect(extractApiErrorMessage({ message: 'Unauthorized' })).toBe('Unauthorized')
    })

    it('prefers detail over message when both present', () => {
        expect(extractApiErrorMessage({ detail: 'Use this', message: 'Not this' })).toBe('Use this')
    })

    it('returns null when neither field present', () => {
        expect(extractApiErrorMessage({ code: 500 })).toBeNull()
    })

    it('returns null for null input', () => {
        expect(extractApiErrorMessage(null)).toBeNull()
    })

    it('returns null for non-object input (string)', () => {
        expect(extractApiErrorMessage('error string')).toBeNull()
    })

    it('returns null for non-object input (number)', () => {
        expect(extractApiErrorMessage(42)).toBeNull()
    })

    it('returns null for empty object', () => {
        expect(extractApiErrorMessage({})).toBeNull()
    })

    it('ignores object-typed detail (FastAPI list-of-errors)', () => {
        expect(extractApiErrorMessage({ detail: [{ msg: 'field required' }] })).toBeNull()
    })
})

// ─── readApiJson ──────────────────────────────────────────────────────────────

function makeResponse(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('readApiJson', () => {
    beforeEach(() => {
        vi.unstubAllEnvs()
    })

    it('parses valid JSON and returns typed value', async () => {
        const res = makeResponse('{"id":"abc","status":"completed"}')
        const data = await readApiJson<{ id: string; status: string }>(res)
        expect(data).toEqual({ id: 'abc', status: 'completed' })
    })

    it('returns undefined for empty body', async () => {
        const res = makeResponse('')
        const data = await readApiJson<unknown>(res)
        expect(data).toBeUndefined()
    })

    it('returns undefined for whitespace-only body', async () => {
        const res = makeResponse('   ')
        const data = await readApiJson<unknown>(res)
        expect(data).toBeUndefined()
    })

    it('strips BOM before parsing', async () => {
        const res = makeResponse('\uFEFF{"ok":true}')
        const data = await readApiJson<{ ok: boolean }>(res)
        expect(data).toEqual({ ok: true })
    })

    it('throws with HTML hint when body starts with <', async () => {
        const res = makeResponse('<html><body>504 Gateway Timeout</body></html>', 504)
        await expect(readApiJson(res)).rejects.toThrow(/Body looks like HTML/)
    })

    it('throws with plain-text hint for non-JSON body', async () => {
        const res = makeResponse('Internal server error', 500)
        await expect(readApiJson(res)).rejects.toThrow(/Body is not valid JSON/)
    })

    it('error message includes the HTTP status code', async () => {
        const res = makeResponse('<error>bad</error>', 502)
        await expect(readApiJson(res)).rejects.toThrow('502')
    })

    it('error message includes a body preview', async () => {
        const res = makeResponse('this is plain text', 400)
        await expect(readApiJson(res)).rejects.toThrow('this is plain text')
    })

    it('truncates very long body previews to 280 chars + ellipsis', async () => {
        const longText = 'x'.repeat(400)
        const res = makeResponse(longText, 500)
        await expect(readApiJson(res)).rejects.toThrow('…')
    })
})
