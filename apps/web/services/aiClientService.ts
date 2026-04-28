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
                resolve(results)
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
                    resolve(msg.data)
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
