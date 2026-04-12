/**
 * Project Gallery API client.
 * Mirrors the backend /api/v1/projects endpoints.
 */

import { fastApiErrorDetail, readApiJson } from '@/lib/readApiJson'
import { createClient } from '@/lib/supabase/client'

const API_BASE =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : 'http://localhost:8000'

// ─── Types (mirror backend Pydantic models) ───────────────────────────────────

export interface Project {
    id: string
    user_id: string
    title: string
    description: string | null
    technologies: string[]
    is_active: boolean
    created_at: string
}

export interface CreateProjectPayload {
    title: string
    description?: string
    technologies?: string[]
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in to continue.')
    }

    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiRequest<T>(
    path: string,
    init: RequestInit = {}
): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
    })

    if (res.status === 204) return undefined as T

    const data = await readApiJson<unknown>(res)
    if (!res.ok) {
        throw new Error(fastApiErrorDetail(data) ?? `API ${res.status}: ${res.statusText}`)
    }
    return data as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
    return apiRequest<Project[]>('/api/v1/projects')
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
    return apiRequest<Project>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
            title: payload.title,
            description: payload.description ?? null,
            technologies: payload.technologies ?? [],
        }),
    })
}

export async function deleteProject(projectId: string): Promise<void> {
    return apiRequest<void>(`/api/v1/projects/${projectId}`, {
        method: 'DELETE',
    })
}
