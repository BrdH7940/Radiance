/**
 * API services and types aligned with the FastAPI backend.
 *
 * - AnalysisService: upload URL, S3 upload, trigger analysis, poll job status.
 * - Workspace: uploadAndAnalyze (orchestrated), renderCvToPdf.
 */

import { createClient } from '@/lib/supabase/client'

const API_BASE =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : 'http://localhost:8000'

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Returns the current Supabase access token, or null if not signed in.
 * Used to inject the Authorization header into authenticated API calls.
 */
export async function getSupabaseToken(): Promise<string | null> {
    try {
        const supabase = createClient()
        const {
            data: { session },
        } = await supabase.auth.getSession()
        return session?.access_token ?? null
    } catch {
        return null
    }
}

// ─── CV Resume Schema types (mirror backend Pydantic models) ─────────────────

export interface CVLink {
    label: string
    url: string
}

export interface CVPersonalInfo {
    name: string
    email: string
    phone?: string | null
    location?: string | null
    links: CVLink[]
}

export interface CVSummary {
    text: string
}

export interface CVExperience {
    company: string
    role: string
    date_range: string
    bullets: string[]
}

export interface CVEducation {
    institution: string
    degree: string
    major: string
    start_date: string
    end_date: string
    location?: string | null
    gpa?: string | null
    honors: string[]
}

export interface CVProject {
    name: string
    role: string
    tech_stack: string[]
    start_date: string
    end_date: string
    link?: string | null
    description: string[]
}

export interface CVSkillGroup {
    category: string
    skills: string[]
}

export interface CVAwardsCertification {
    title: string
    link?: string | null
}

export interface CVResumeSchema {
    personal_info: CVPersonalInfo
    summary?: CVSummary | null
    experiences: CVExperience[]
    education: CVEducation[]
    projects: CVProject[]
    skill_groups: CVSkillGroup[]
    awards_certifications: CVAwardsCertification[]
    /** Populated by Strategic mode when gallery is empty/unrelated. */
    recommended_actions?: string[]
}

// ─── Gallery / Strategic mode types ──────────────────────────────────────────

/** FSM phase for the Strategic Gallery enhancement flow (parallel to legacy `AppPhase`). */
export type GalleryPhase = 'IDLE' | 'ANALYZING' | 'CONSULTING_GALLERY' | 'FINALIZING' | 'ERROR'

/** Adapter view of a project_gallery row sent to the AI worker and backend. */
export interface ProjectItem {
    id: string
    title: string
    description: string | null
    tech_stack: string[]
}

/** A single ranked project result from the WebWorker or fallback API. */
export interface ClientAIResult {
    project_id: string
    /** Cosine similarity score in [0, 1]. */
    fit_score: number
    client_reasoning: string
}

/** POST /api/v1/analyses/enhance-from-gallery */
export interface EnhanceFromGalleryRequest {
    cv_text: string
    jd_text: string
    client_results: ClientAIResult[]
}

/** POST /api/v1/fallback/client-ai */
export interface FallbackClientAIRequest {
    jd_text: string
    project_gallery: ProjectItem[]
}

// ─── API response types ───────────────────────────────────────────────────────

/** POST /api/v1/resumes/upload-urls */
export interface ResumeUploadUrlRequest {
    file_name: string
    content_type: string
}

export interface ResumeUploadUrlResponse {
    upload_url: string
    s3_key: string
    bucket: string
}

/** POST /api/v1/analyses */
export interface CreateAnalysisRequest {
    s3_key: string
    jd_text: string
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface CreateAnalysisResponse {
    id: string
    status: JobStatus
}

/** GET /api/v1/analyses/{id} */
export interface SkillGapDTO {
    skill: string
    importance: string
}

export interface RedFlagDTO {
    title: string
    description: string
    severity: string
}

export interface AnalysisResultDTO {
    matching_score: number
    missing_skills: SkillGapDTO[]
    red_flags: RedFlagDTO[]
    enhanced_cv_json: CVResumeSchema
    pdf_url: string
}

export interface AnalysisStatusResponse {
    id: string
    status: JobStatus
    error: string | null
    result: AnalysisResultDTO | null
}

export interface EditorRenderResponse {
    pdf_url: string
    success: boolean
    error?: string | null
}

// ─── AnalysisService ─────────────────────────────────────────────────────────

async function getJson<T>(
    url: string,
    init?: RequestInit,
    authToken?: string | null
): Promise<T> {
    const authHeaders: Record<string, string> = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {}

    const res = await fetch(url, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers as Record<string, string>),
            ...authHeaders,
        },
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`API ${res.status}: ${text || res.statusText}`)
    }
    return res.json() as Promise<T>
}

export const AnalysisService = {
    async getUploadUrl(
        fileName: string,
        contentType: string
    ): Promise<ResumeUploadUrlResponse> {
        const token = await getSupabaseToken()
        return getJson<ResumeUploadUrlResponse>(
            `${API_BASE}/api/v1/resumes/upload-urls`,
            {
                method: 'POST',
                body: JSON.stringify({
                    file_name: fileName,
                    content_type: contentType,
                }),
            },
            token
        )
    },

    async uploadToS3(file: File, uploadUrl: string): Promise<void> {
        const res = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
        })
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`S3 upload failed: ${res.status} ${text || res.statusText}`)
        }
    },

    async triggerAnalysis(
        s3Key: string,
        jdText: string,
        jobTitle?: string | null,
        companyName?: string | null
    ): Promise<CreateAnalysisResponse> {
        const token = await getSupabaseToken()
        return getJson<CreateAnalysisResponse>(
            `${API_BASE}/api/v1/analyses`,
            {
                method: 'POST',
                body: JSON.stringify({
                    s3_key: s3Key,
                    jd_text: jdText,
                    job_title: jobTitle ?? null,
                    company_name: companyName ?? null,
                }),
            },
            token
        )
    },

    async pollJobStatus(jobId: string): Promise<AnalysisStatusResponse> {
        const token = await getSupabaseToken()
        return getJson<AnalysisStatusResponse>(
            `${API_BASE}/api/v1/analyses/${jobId}`,
            undefined,
            token
        )
    },
}

// ─── Async upload + analyze (orchestrated flow) ───────────────────────────────

export type OnStepCallback = (stepIndex: number) => void

export interface UploadAndAnalyzeResult {
    jobId: string
    status: JobStatus
    result: AnalysisResultDTO | null
    error: string | null
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 300 // ~10 min

export async function uploadAndAnalyze(
    cvFile: File,
    jdText: string,
    onStep?: OnStepCallback
): Promise<UploadAndAnalyzeResult> {
    onStep?.(0)

    const { upload_url, s3_key } = await AnalysisService.getUploadUrl(
        cvFile.name,
        cvFile.type || 'application/pdf'
    )
    onStep?.(1)

    await AnalysisService.uploadToS3(cvFile, upload_url)
    onStep?.(2)

    const { id: jobId } = await AnalysisService.triggerAnalysis(s3_key, jdText.trim())
    onStep?.(3)

    return new Promise((resolve) => {
        let attempts = 0
        const intervalId = setInterval(async () => {
            attempts++
            if (attempts > MAX_POLL_ATTEMPTS) {
                clearInterval(intervalId)
                resolve({ jobId, status: 'failed', result: null, error: 'Analysis timed out. Please try again.' })
                return
            }
            try {
                const statusResponse = await AnalysisService.pollJobStatus(jobId)
                onStep?.(4)

                if (statusResponse.status === 'completed' && statusResponse.result) {
                    clearInterval(intervalId)
                    resolve({ jobId, status: 'completed', result: statusResponse.result, error: null })
                    return
                }
                if (statusResponse.status === 'failed') {
                    clearInterval(intervalId)
                    resolve({ jobId, status: 'failed', result: null, error: statusResponse.error || 'Analysis failed.' })
                }
            } catch (err) {
                clearInterval(intervalId)
                resolve({ jobId, status: 'failed', result: null, error: err instanceof Error ? err.message : 'Polling failed.' })
            }
        }, POLL_INTERVAL_MS)
    })
}

// ─── Workspace / editor APIs ──────────────────────────────────────────────────

/**
 * Render CVResumeSchema to PDF on the server (POST /api/v1/editor/renders).
 * Returns a presigned S3 URL to the generated PDF.
 */
export async function renderCvToPdf(cvData: CVResumeSchema): Promise<EditorRenderResponse> {
    const token = await getSupabaseToken()
    const res = await fetch(`${API_BASE}/api/v1/editor/renders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cv_data: cvData }),
    })

    const data = (await res.json()) as EditorRenderResponse
    if (!res.ok) {
        throw new Error(data.error || `Render failed (${res.status})`)
    }
    return data
}

// ─── Gallery / Strategic mode APIs ───────────────────────────────────────────

/**
 * Fallback for when the client-side WebWorker cannot load (no WebGPU / OOM).
 * Sends the full gallery to Gemini on the server and gets back ranked results.
 */
export async function callFallbackClientAI(
    request: FallbackClientAIRequest
): Promise<ClientAIResult[]> {
    const token = await getSupabaseToken()
    return getJson<ClientAIResult[]>(
        `${API_BASE}/api/v1/fallback/client-ai`,
        { method: 'POST', body: JSON.stringify(request) },
        token
    )
}

/**
 * Kick off a strategic CV enhancement from the gallery.
 * Returns a job ID to poll via the standard GET /api/v1/analyses/{id} endpoint.
 */
export async function enhanceFromGallery(
    request: EnhanceFromGalleryRequest
): Promise<CreateAnalysisResponse> {
    const token = await getSupabaseToken()
    return getJson<CreateAnalysisResponse>(
        `${API_BASE}/api/v1/analyses/enhance-from-gallery`,
        { method: 'POST', body: JSON.stringify(request) },
        token
    )
}
