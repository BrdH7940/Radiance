import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Project, CreateProjectPayload } from '@/services/projectApi'

// ─── Mock Supabase client ─────────────────────────────────────────────────────

vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({
        auth: {
            getSession: vi.fn().mockResolvedValue({
                data: { session: { access_token: 'test-token' } },
            }),
        },
    }),
}))

// ─── Import after mocks ───────────────────────────────────────────────────────

const { getProjects, createProject, deleteProject } = await import('@/services/projectApi')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'proj-1',
        user_id: 'user-123',
        title: 'My Project',
        description: 'A cool project',
        technologies: ['React', 'TypeScript'],
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        ...overrides,
    }
}

function mockFetchOk(body: unknown, status = 200) {
    const bodyStr = JSON.stringify(body)
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status,
        statusText: 'OK',
        text: () => Promise.resolve(bodyStr),
        json: () => Promise.resolve(body),
    })
}

function mockFetchError(body: unknown, status: number) {
    const bodyStr = JSON.stringify(body)
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText: 'Error',
        text: () => Promise.resolve(bodyStr),
        json: () => Promise.resolve(body),
    })
}

// ─── getProjects ──────────────────────────────────────────────────────────────

describe('getProjects', () => {
    beforeEach(() => vi.resetAllMocks())

    it('returns array of projects on success', async () => {
        const projects = [makeProject({ id: 'proj-1' }), makeProject({ id: 'proj-2' })]
        mockFetchOk(projects)
        const result = await getProjects()
        expect(result).toHaveLength(2)
        expect(result[0].id).toBe('proj-1')
    })

    it('returns empty array when backend returns []', async () => {
        mockFetchOk([])
        const result = await getProjects()
        expect(result).toEqual([])
    })

    it('sends Authorization header with Bearer token', async () => {
        mockFetchOk([])
        await getProjects()
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(init.headers['Authorization']).toBe('Bearer test-token')
    })

    it('targets /api/v1/projects endpoint', async () => {
        mockFetchOk([])
        await getProjects()
        const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(url).toMatch(/\/api\/v1\/projects$/)
    })

    it('throws with backend error detail on non-ok response', async () => {
        mockFetchError({ detail: 'Internal server error' }, 500)
        await expect(getProjects()).rejects.toThrow('Internal server error')
    })

    it('throws with status fallback when no detail/message', async () => {
        mockFetchError({}, 503)
        await expect(getProjects()).rejects.toThrow('503')
    })
})

// ─── createProject ────────────────────────────────────────────────────────────

describe('createProject', () => {
    beforeEach(() => vi.resetAllMocks())

    it('returns created project on success', async () => {
        const project = makeProject({ title: 'New Project' })
        mockFetchOk(project, 201)
        const result = await createProject({ title: 'New Project' })
        expect(result.title).toBe('New Project')
    })

    it('sends POST request', async () => {
        mockFetchOk(makeProject())
        await createProject({ title: 'Test' })
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(init.method).toBe('POST')
    })

    it('serializes title correctly in request body', async () => {
        mockFetchOk(makeProject())
        const payload: CreateProjectPayload = { title: 'CV Tracker' }
        await createProject(payload)
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.title).toBe('CV Tracker')
    })

    it('sends description in body when provided', async () => {
        mockFetchOk(makeProject())
        await createProject({ title: 'T', description: 'A desc' })
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.description).toBe('A desc')
    })

    it('sends null for description when omitted', async () => {
        mockFetchOk(makeProject())
        await createProject({ title: 'T' })
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.description).toBeNull()
    })

    it('sends technologies array in body', async () => {
        mockFetchOk(makeProject())
        await createProject({ title: 'T', technologies: ['Go', 'Postgres'] })
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.technologies).toEqual(['Go', 'Postgres'])
    })

    it('sends empty technologies array when omitted', async () => {
        mockFetchOk(makeProject())
        await createProject({ title: 'T' })
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const body = JSON.parse(init.body as string)
        expect(body.technologies).toEqual([])
    })

    it('throws with backend error message on non-ok', async () => {
        mockFetchError({ message: 'Title already exists' }, 409)
        await expect(createProject({ title: 'Duplicate' })).rejects.toThrow('Title already exists')
    })
})

// ─── deleteProject ────────────────────────────────────────────────────────────

describe('deleteProject', () => {
    beforeEach(() => vi.resetAllMocks())

    it('resolves without error on 204 No Content', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 204,
            statusText: 'No Content',
            text: () => Promise.resolve(''),
            json: () => Promise.resolve(undefined),
        })
        await expect(deleteProject('proj-1')).resolves.toBeUndefined()
    })

    it('sends DELETE request', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') })
        await deleteProject('proj-99')
        const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(init.method).toBe('DELETE')
    })

    it('includes project ID in URL', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve('') })
        await deleteProject('proj-abc')
        const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        expect(url).toMatch(/\/api\/v1\/projects\/proj-abc$/)
    })

    it('throws with error detail when delete is rejected', async () => {
        mockFetchError({ detail: 'Project not found' }, 404)
        await expect(deleteProject('nonexistent')).rejects.toThrow('Project not found')
    })
})

// ─── Authentication guard ─────────────────────────────────────────────────────

describe('projectApi — unauthenticated', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        // Override the Supabase mock to return no session
        vi.doMock('@/lib/supabase/client', () => ({
            createClient: () => ({
                auth: {
                    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
                },
            }),
        }))
    })

    it('getAuthHeaders throws when no session is present', async () => {
        // Re-import to pick up the new mock
        vi.resetModules()
        vi.doMock('@/lib/supabase/client', () => ({
            createClient: () => ({
                auth: {
                    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
                },
            }),
        }))
        const { getProjects: getProjectsNoAuth } = await import('@/services/projectApi')
        await expect(getProjectsNoAuth()).rejects.toThrow('Not authenticated')
    })
})
