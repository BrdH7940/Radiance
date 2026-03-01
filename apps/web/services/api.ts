/**
 * API services and types aligned with the FastAPI backend.
 *
 * - AnalysisService: upload URL, S3 upload, trigger analysis, poll job status.
 * - Legacy/workspace: uploadAndAnalyze (orchestrated async), aiEditSelectedText.
 */

const API_BASE =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:8000';

// ─── Response types (backend contract) ───────────────────────────────────────

/** POST /api/v1/resumes/upload-urls */
export interface ResumeUploadUrlRequest {
  file_name: string;
  content_type: string;
}

export interface ResumeUploadUrlResponse {
  upload_url: string;
  s3_key: string;
  bucket: string;
}

/** POST /api/v1/analyses */
export interface CreateAnalysisRequest {
  s3_key: string;
  jd_text: string;
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface CreateAnalysisResponse {
  id: string;
  status: JobStatus;
}

/** GET /api/v1/analyses/{id} */
export interface SkillGapDTO {
  skill: string;
  importance: string;
}

export interface RedFlagDTO {
  title: string;
  description: string;
  severity: string;
}

export interface AnalysisResultDTO {
  matching_score: number;
  missing_skills: SkillGapDTO[];
  red_flags: RedFlagDTO[];
  latex_code: string;
  pdf_url: string;
}

export interface AnalysisStatusResponse {
  id: string;
  status: JobStatus;
  error: string | null;
  result: AnalysisResultDTO | null;
}

/** Legacy / workspace types */
export interface AnalyzeResult {
  latexCode: string;
  pdfUrl: string;
}

export interface AIEditResult {
  newText: string;
}

// ─── AnalysisService ─────────────────────────────────────────────────────────

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const AnalysisService = {
  /** Get a presigned URL for uploading the resume PDF to S3. */
  async getUploadUrl(
    fileName: string,
    contentType: string
  ): Promise<ResumeUploadUrlResponse> {
    return getJson<ResumeUploadUrlResponse>(
      `${API_BASE}/api/v1/resumes/upload-urls`,
      {
        method: 'POST',
        body: JSON.stringify({ file_name: fileName, content_type: contentType }),
      }
    );
  },

  /** Upload the file directly to S3 using the presigned PUT URL. */
  async uploadToS3(file: File, uploadUrl: string): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 upload failed: ${res.status} ${text || res.statusText}`);
    }
  },

  /** Start the async analysis job; returns job id and initial status. */
  async triggerAnalysis(
    s3Key: string,
    jdText: string
  ): Promise<CreateAnalysisResponse> {
    return getJson<CreateAnalysisResponse>(`${API_BASE}/api/v1/analyses`, {
      method: 'POST',
      body: JSON.stringify({ s3_key: s3Key, jd_text: jdText }),
    });
  },

  /** Poll the current status of an analysis job. */
  async pollJobStatus(jobId: string): Promise<AnalysisStatusResponse> {
    return getJson<AnalysisStatusResponse>(
      `${API_BASE}/api/v1/analyses/${jobId}`
    );
  },
};

// ─── Async upload + analyze (orchestrated flow) ──────────────────────────────

export type OnStepCallback = (stepIndex: number) => void;

export interface UploadAndAnalyzeResult {
  jobId: string;
  status: JobStatus;
  result: AnalysisResultDTO | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 300; // ~10 min

/**
 * Orchestrates: get upload URL -> upload file to S3 -> trigger analysis -> poll until completed/failed.
 * Updates loading step index via onStep. Does not throw on job failure; returns { status: 'failed', error }.
 */
export async function uploadAndAnalyze(
  cvFile: File,
  jdText: string,
  onStep?: OnStepCallback
): Promise<UploadAndAnalyzeResult> {
  onStep?.(0);

  const { upload_url, s3_key } = await AnalysisService.getUploadUrl(
    cvFile.name,
    cvFile.type || 'application/pdf'
  );
  onStep?.(1);

  await AnalysisService.uploadToS3(cvFile, upload_url);
  onStep?.(2);

  const { id: jobId, status: initialStatus } =
    await AnalysisService.triggerAnalysis(s3_key, jdText.trim());
  onStep?.(3);

  let attempts = 0;
  return new Promise((resolve) => {
    const intervalId = setInterval(async () => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        resolve({
          jobId,
          status: 'failed',
          result: null,
          error: 'Analysis timed out. Please try again.',
        });
        return;
      }

      try {
        const statusResponse = await AnalysisService.pollJobStatus(jobId);
        onStep?.(4);

        if (statusResponse.status === 'completed' && statusResponse.result) {
          clearInterval(intervalId);
          resolve({
            jobId,
            status: 'completed',
            result: statusResponse.result,
            error: null,
          });
          return;
        }

        if (statusResponse.status === 'failed') {
          clearInterval(intervalId);
          resolve({
            jobId,
            status: 'failed',
            result: null,
            error: statusResponse.error || 'Analysis failed.',
          });
        }
      } catch (err) {
        clearInterval(intervalId);
        resolve({
          jobId,
          status: 'failed',
          result: null,
          error: err instanceof Error ? err.message : 'Polling failed.',
        });
      }
    }, POLL_INTERVAL_MS);
  });
}

// ─── Workspace / editor APIs ──────────────────────────────────────────────────

/**
 * AI rewrite of selected LaTeX text (POST /api/v1/editor/refinements).
 * Replaces the selection with the refined LaTeX snippet.
 */
export async function aiEditSelectedText(
  selectedText: string,
  prompt: string
): Promise<AIEditResult> {
  const res = await fetch(`${API_BASE}/api/v1/editor/refinements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selected_text: selectedText, prompt }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Refinement failed (${res.status})`);
  }

  const data = (await res.json()) as { new_text: string };
  return { newText: data.new_text };
}

/** Response from POST /api/v1/editor/renders */
export interface EditorRenderResponse {
  pdf_url: string;
  success: boolean;
  error?: string | null;
}

/**
 * Compile LaTeX to PDF and get a presigned URL (POST /api/v1/editor/renders).
 */
export async function compileLaTeXToPdf(
  latexCode: string
): Promise<EditorRenderResponse> {
  const res = await fetch(`${API_BASE}/api/v1/editor/renders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex_code: latexCode }),
  });

  const data = (await res.json()) as EditorRenderResponse;
  if (!res.ok) {
    throw new Error(data.error || `Render failed (${res.status})`);
  }
  return data;
}
