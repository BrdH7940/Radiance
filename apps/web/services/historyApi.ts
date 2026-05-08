/**
 * CV History API client.
 * Mirrors the backend /api/v1/history endpoints.
 */

import { extractApiErrorMessage, readApiJson } from '@/lib/readApiJson'
import { createClient } from '@/lib/supabase/client'
import type { CVResumeSchema } from '@/services/api'

const API_BASE =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : 'http://localhost:8000'

// ─── Types (mirror backend Pydantic models) ───────────────────────────────────

export interface CVHistorySummary {
    id: string
    job_title: string | null
    company_name: string | null
    matching_score: number | null
    created_at: string
}

export interface CVHistoryEntry extends CVHistorySummary {
    user_id: string
    jd_text: string | null
    enhanced_cv_json: CVResumeSchema | null
    pdf_s3_key: string | null
    missing_skills: Array<{ skill: string; importance: string }> | null
    red_flags: Array<{ title: string; description: string; severity: string }> | null
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

// Cache the token for 50 seconds — same TTL as api.ts — to avoid repeated
// Supabase round-trips when the history page polls or re-fetches frequently.
let _cachedToken: string | null = null
let _tokenExpiresAt = 0
const TOKEN_CACHE_TTL_MS = 50_000

async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!_cachedToken || Date.now() >= _tokenExpiresAt) {
        const supabase = createClient()
        const {
            data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
            throw new Error('Not authenticated. Please sign in to continue.')
        }

        _cachedToken = session.access_token
        _tokenExpiresAt = Date.now() + TOKEN_CACHE_TTL_MS
    }

    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${_cachedToken}`,
    }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    })

    if (res.status === 204) {
        return undefined as T
    }

    const data = await readApiJson<unknown>(res)
    if (!res.ok) {
        throw new Error(extractApiErrorMessage(data) ?? `API ${res.status}: ${res.statusText}`)
    }
    return data as T
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getHistory(): Promise<CVHistorySummary[]> {
    return apiRequest<CVHistorySummary[]>('/api/v1/history')
}

export async function getHistoryItem(historyId: string): Promise<CVHistoryEntry> {
    return apiRequest<CVHistoryEntry>(`/api/v1/history/${historyId}`)
}

export interface UpdateHistoryPayload {
    job_title?: string | null
    company_name?: string | null
}

export async function updateHistoryItem(
    historyId: string,
    payload: UpdateHistoryPayload
): Promise<CVHistoryEntry> {
    return apiRequest<CVHistoryEntry>(`/api/v1/history/${historyId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    })
}

export async function deleteHistoryItem(historyId: string): Promise<void> {
    await apiRequest<void>(`/api/v1/history/${historyId}`, { method: 'DELETE' })
}
