import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalysisStatusResponse, ResumeUploadUrlResponse, CreateAnalysisResponse } from '@/services/api'

// ─── Mock Supabase client (getSupabaseToken dependency) ──────────────────────

vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({
        auth: {
            getSession: vi.fn().mockResolvedValue({
                data: { session: { access_token: 'test-token' } },
            }),
        },
    }),
}))

// ─── Import after mocks are in place ─────────────────────────────────────────

const { uploadAndAnalyze, AnalysisService } = await import('@/services/api')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(response: unknown, ok = true, status = 200) {
    return vi.fn().mockResolvedValue({
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
    })
}

function makePdfFile(): File {
    return new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' })
}

const UPLOAD_URL_RESPONSE: ResumeUploadUrlResponse = {
    upload_url: 'https://s3.example.com/presigned-put',
    s3_key: 'uploads/resume.pdf',
    bucket: 'cv-bucket',
}

const TRIGGER_RESPONSE: CreateAnalysisResponse = {
    id: 'job-123',
    status: 'queued',
}

const COMPLETED_STATUS: AnalysisStatusResponse = {
    id: 'job-123',
    status: 'completed',
    error: null,
    result: {
        matching_score: 85,
        missing_skills: [{ skill: 'Kubernetes', importance: 'high' }],
        red_flags: [],
        enhanced_cv_json: {} as never,
        pdf_url: 'https://s3.example.com/enhanced.pdf',
    },
}

const FAILED_STATUS: AnalysisStatusResponse = {
    id: 'job-123',
    status: 'failed',
    error: 'LLM quota exceeded',
    result: null,
}

// ─── AnalysisService unit tests ───────────────────────────────────────────────

describe('AnalysisService.uploadToS3', () => {
    beforeEach(() => { vi.resetAllMocks() })

    it('sends PUT with correct Content-Type', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
        const file = makePdfFile()
        await AnalysisService.uploadToS3(file, 'https://s3.example.com/presigned')
        expect(global.fetch).toHaveBeenCalledWith(
            'https://s3.example.com/presigned',
            expect.objectContaining({
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': 'application/pdf' },
            })
        )
    })

    it('throws on non-ok S3 response', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden', text: () => Promise.resolve('Access Denied') })
        await expect(
            AnalysisService.uploadToS3(makePdfFile(), 'https://s3.example.com/presigned')
        ).rejects.toThrow('S3 upload failed: 403')
    })
})

// ─── uploadAndAnalyze integration flow ───────────────────────────────────────

describe('uploadAndAnalyze', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.resetAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('happy path: resolves with completed result after one poll', async () => {
        // fetch call sequence:
        //   1. POST /resumes/upload-urls  → upload URL
        //   2. PUT  s3 presigned URL      → 200 OK
        //   3. POST /analyses             → job created
        //   4. GET  /analyses/job-123     → completed
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(COMPLETED_STATUS), text: () => Promise.resolve(JSON.stringify(COMPLETED_STATUS)) })

        const onStep = vi.fn()
        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Senior React Engineer at Acme', onStep)

        // Advance past the 2000ms poll interval
        await vi.runAllTimersAsync()

        const result = await resultPromise
        expect(result.status).toBe('completed')
        expect(result.jobId).toBe('job-123')
        expect(result.result?.matching_score).toBe(85)
        expect(result.error).toBeNull()
    })

    it('reports step callbacks in order (0 → 1 → 2 → 3 → 4)', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(COMPLETED_STATUS), text: () => Promise.resolve(JSON.stringify(COMPLETED_STATUS)) })

        const steps: number[] = []
        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Engineer JD', (step) => steps.push(step))

        await vi.runAllTimersAsync()
        await resultPromise

        expect(steps).toEqual([0, 1, 2, 3, 4])
    })

    it('resolves failed when backend reports status=failed', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(FAILED_STATUS), text: () => Promise.resolve(JSON.stringify(FAILED_STATUS)) })

        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Some JD')
        await vi.runAllTimersAsync()
        const result = await resultPromise

        expect(result.status).toBe('failed')
        expect(result.error).toBe('LLM quota exceeded')
        expect(result.result).toBeNull()
    })

    it('resolves failed with fallback error when backend failed.error is null', async () => {
        const failedNoMsg: AnalysisStatusResponse = { id: 'job-123', status: 'failed', error: null, result: null }

        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(failedNoMsg), text: () => Promise.resolve(JSON.stringify(failedNoMsg)) })

        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Some JD')
        await vi.runAllTimersAsync()
        const result = await resultPromise

        expect(result.status).toBe('failed')
        expect(result.error).toBe('Analysis failed.')
    })

    it('resolves failed when a network/poll error is thrown', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockRejectedValueOnce(new Error('Network error'))

        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Some JD')
        await vi.runAllTimersAsync()
        const result = await resultPromise

        expect(result.status).toBe('failed')
        expect(result.error).toBe('Network error')
    })

    it('times out after MAX_POLL_ATTEMPTS (300 × 2s = ~10 min)', async () => {
        // First three calls succeed (upload URL, S3 PUT, trigger)
        // All subsequent poll calls return "processing" indefinitely
        const processingStatus: AnalysisStatusResponse = { id: 'job-123', status: 'processing', error: null, result: null }

        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(processingStatus), text: () => Promise.resolve(JSON.stringify(processingStatus)) })

        const resultPromise = uploadAndAnalyze(makePdfFile(), 'Some JD')
        await vi.runAllTimersAsync()
        const result = await resultPromise

        expect(result.status).toBe('failed')
        expect(result.error).toMatch(/timed out/i)
    })

    it('trims jdText before sending to triggerAnalysis', async () => {
        global.fetch = vi.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(UPLOAD_URL_RESPONSE), text: () => Promise.resolve(JSON.stringify(UPLOAD_URL_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200 })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(TRIGGER_RESPONSE), text: () => Promise.resolve(JSON.stringify(TRIGGER_RESPONSE)) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(COMPLETED_STATUS), text: () => Promise.resolve(JSON.stringify(COMPLETED_STATUS)) })

        const resultPromise = uploadAndAnalyze(makePdfFile(), '  Senior Dev  ')
        await vi.runAllTimersAsync()
        await resultPromise

        // The third fetch call is triggerAnalysis; body should have trimmed jd_text
        const thirdCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[2]
        const body = JSON.parse(thirdCall[1].body as string)
        expect(body.jd_text).toBe('Senior Dev')
    })
})
