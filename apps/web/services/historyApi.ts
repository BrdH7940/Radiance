/**
 * CV History API client.
 * Mirrors the backend /api/v1/history endpoints.
 */

import { fastApiErrorDetail, readApiJson } from '@/lib/readApiJson'
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

async function apiRequest<T>(path: string): Promise<T> {
    const headers = await getAuthHeaders()
    const res = await fetch(`${API_BASE}${path}`, { headers })

    const data = await readApiJson<unknown>(res)
    if (!res.ok) {
        throw new Error(fastApiErrorDetail(data) ?? `API ${res.status}: ${res.statusText}`)
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
