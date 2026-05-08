/**
 * aiClientService — bridge between the UI and the AI WebWorker.
 *
 * Responsibilities:
 *   1. Spawn the WebWorker and send it the ANALYZE message.
 *   2. Forward PROGRESS messages to an optional callback so the UI can
 *      render step labels ("Ranking Projects..." / "Generating Reasoning...").
 *   3. If the worker posts FALLBACK_REQUIRED (OOM, no WebGPU, etc.), silently
 *      call the backend Gemini fallback endpoint and resolve with those results.
 *   4. Terminate the worker when done (one-shot usage pattern).
 *
 * The caller (dashboard page) never needs to know whether the results came
 * from the local model or the server — the interface is identical.
 */

import { callFallbackClientAI } from '@/services/api'
import type { ClientAIResult, ProjectItem } from '@/services/api'

export type ProgressStep = 1 | 2

export type OnProgressCallback = (step: ProgressStep) => void

/**
 * Detect tiny-model loops where the same 4-word window repeats verbatim,
 * e.g. "the project is relevant because the project is relevant because…".
 * Returns true when at least one 4-gram appears 2+ times in the string.
 */
function hasRepeatingFourGram(s: string): boolean {
    const tokens = s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
    if (tokens.length < 8) return false
    const seen = new Set<string>()
    for (let i = 0; i + 4 <= tokens.length; i++) {
        const key = tokens.slice(i, i + 4).join(' ')
        if (seen.has(key)) return true
        seen.add(key)
    }
    return false
}

function normalizeClientReasoning(raw: string | null | undefined): string {
    const DEFAULT = 'Relevant technical experience matches the job requirements.'
    const s = (raw ?? '').replace(/\u0000/g, '').trim()
    if (!s) return DEFAULT

    // Remove leading marker if present.
    const lowered = s.toLowerCase()
    const markerIdx = lowered.indexOf('reasoning:')
    const afterMarker = markerIdx >= 0 ? s.slice(markerIdx + 'reasoning:'.length).trim() : s

    const unwrapped = afterMarker
        .replace(/^[`"'“”‘’]+/, '')
        .replace(/[`"'“”‘’]+$/, '')
        .trim()

    // Defend against residual SmolLM2-style loops the worker's repetition_penalty
    // didn't fully suppress.
    if (hasRepeatingFourGram(unwrapped)) return DEFAULT

    if (unwrapped.length >= 15) return unwrapped

    // As a last resort, if the string still contains useful text, keep it; otherwise default.
    const fallback = s
        .replace(/^[`"'“”‘’]+/, '')
        .replace(/[`"'“”‘’]+$/, '')
        .trim()

    if (hasRepeatingFourGram(fallback)) return DEFAULT

    return fallback.length >= 15 ? fallback : DEFAULT
}

function normalizeClientResults(results: ClientAIResult[]): ClientAIResult[] {
    return results.map((r) => ({
        ...r,
        client_reasoning: normalizeClientReasoning(r.client_reasoning),
    }))
}

/**
 * Run client-side AI analysis on the user's project gallery against a JD.
 *
 * @param jd       Full job description text.
 * @param gallery  The user's projects (from Zustand `projectGallery`).
 * @param onProgress  Called with step=1 (ranking) and step=2 (reasoning).
 * @returns        Up to 5 ranked projects with fit scores and reasoning.
 */
export async function analyzeProjectsWithClientAI(
    jd: string,
    gallery: ProjectItem[],
    onProgress?: OnProgressCallback
): Promise<ClientAIResult[]> {
    return new Promise((resolve, reject) => {
        let worker: Worker | null = null

        const fallback = async (reason?: string) => {
            console.warn('[aiClientService] WebWorker fallback triggered:', reason)
            worker?.terminate()
            try {
                const results = await callFallbackClientAI({ jd_text: jd, project_gallery: gallery })
                resolve(normalizeClientResults(results))
            } catch (err) {
                reject(err)
            }
        }

        try {
            // Worker file is resolved relative to the app root by Next.js bundler.
            worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), {
                type: 'module',
            })
        } catch {
            // Worker constructor itself failed (e.g. SSR context) — go straight to fallback.
            void fallback('Worker constructor failed')
            return
        }

        worker.onmessage = (event: MessageEvent) => {
            const msg = event.data as
                | { type: 'PROGRESS'; step: ProgressStep }
                | { type: 'RESULT'; data: ClientAIResult[] }
                | { type: 'FALLBACK_REQUIRED'; reason: string }
                | { type: 'ERROR'; message: string }

            switch (msg.type) {
                case 'PROGRESS':
                    onProgress?.(msg.step)
                    break

                case 'RESULT':
                    worker?.terminate()
                    resolve(normalizeClientResults(msg.data))
                    break

                case 'FALLBACK_REQUIRED':
                    void fallback(msg.reason)
                    break

                case 'ERROR':
                    worker?.terminate()
                    reject(new Error(msg.message))
                    break
            }
        }

        worker.onerror = (err) => {
            void fallback(`Worker runtime error: ${err.message}`)
        }

        worker.postMessage({ type: 'ANALYZE', jd, gallery })
    })
}
