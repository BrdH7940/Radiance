/**
 * AI WebWorker — runs entirely in the browser, off the UI thread.
 *
 * Two-phase pipeline:
 *   Phase 1 (Embedding & Ranking): Use all-MiniLM-L6-v2 to embed the JD and
 *     each project, compute cosine similarity, and return the Top 5 projects.
 *   Phase 2 (Reasoning): Use SmolLM-135M-Instruct (quantized) to generate a
 *     one-sentence explanation of why each Top-5 project fits the JD.
 *
 * Message protocol (in → out):
 *   IN:  { type: 'ANALYZE'; jd: string; gallery: ProjectItem[] }
 *   OUT: { type: 'PROGRESS'; step: 1 | 2 }
 *        { type: 'RESULT'; data: ClientAIResult[] }
 *        { type: 'FALLBACK_REQUIRED'; reason: string }
 *        { type: 'ERROR'; message: string }
 *
 * Security: This worker only reads data — it never writes to any storage.
 * The fit_scores it produces are advisory only; the backend re-verifies
 * all project IDs against Supabase before passing anything to Gemini.
 */

import type { ClientAIResult, ProjectItem } from '@/services/api'

// Transformers.js v3 uses ESM — imported lazily inside the try block so that
// a failed dynamic import triggers the fallback rather than crashing the worker.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
}

function buildProjectText(item: ProjectItem): string {
    const techStr = item.tech_stack.join(', ')
    return `${item.title}. ${item.description ?? ''} Technologies: ${techStr}`.trim()
}

function extractReasoning(raw: string): string {
    const match = raw.match(/REASONING:\s*(.+)/i)
    if (match?.[1]) return match[1].trim()
    // Fallback: take first non-empty sentence
    const sentence = raw.split(/[.\n]/)[0].trim()
    return sentence.length > 10 ? sentence : 'Relevant experience matches the job requirements.'
}

// ─── Main handler ─────────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
    const { type, jd, gallery } = event.data as {
        type: string
        jd: string
        gallery: ProjectItem[]
    }

    if (type !== 'ANALYZE') return

    try {
        // ── Phase 1: Embedding & Ranking ──────────────────────────────────────
        self.postMessage({ type: 'PROGRESS', step: 1 })

        // Dynamic import so a load failure is catchable
        const { pipeline, env } = await import(
            // @ts-expect-error — Transformers.js v3 has no bundled types yet
            'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js'
        )

        // Disable local model caching in the worker context
        env.allowLocalModels = false
        env.useBrowserCache = true

        const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true,
        })

        const jdEmbedding: number[] = Array.from(
            (await embedder(jd, { pooling: 'mean', normalize: true })).data as Float32Array
        )

        const scored: Array<{ item: ProjectItem; score: number }> = []
        for (const item of gallery) {
            const text = buildProjectText(item)
            const emb: number[] = Array.from(
                (await embedder(text, { pooling: 'mean', normalize: true })).data as Float32Array
            )
            scored.push({ item, score: cosineSimilarity(jdEmbedding, emb) })
        }

        const top5 = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)

        // ── Phase 2: Reasoning ────────────────────────────────────────────────
        self.postMessage({ type: 'PROGRESS', step: 2 })

        const generator = await pipeline('text-generation', 'HuggingFaceTB/SmolLM2-135M-Instruct', {
            quantized: true,
            dtype: 'q4',
        })

        const results: ClientAIResult[] = []

        for (const { item, score } of top5) {
            const prompt =
                `Job Description (excerpt): ${jd.slice(0, 300)}\n\n` +
                `Project: ${buildProjectText(item)}\n\n` +
                `Explain in exactly one sentence why this project is relevant to the job. ` +
                `Start your response with "REASONING:"`

            let reasoning = 'Relevant technical experience matches the job requirements.'
            try {
                const out = await generator(prompt, {
                    max_new_tokens: 60,
                    temperature: 0.3,
                    do_sample: false,
                })
                const generated: string =
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (out as any)[0]?.generated_text ?? ''
                // Strip the prompt prefix that some models echo back
                const afterPrompt = generated.includes('REASONING:')
                    ? generated.slice(generated.indexOf('REASONING:'))
                    : generated
                reasoning = extractReasoning(afterPrompt)
            } catch {
                // Non-fatal: keep default reasoning and continue
            }

            results.push({
                project_id: item.id,
                fit_score: Math.round(score * 100) / 100,
                client_reasoning: reasoning,
            })
        }

        self.postMessage({ type: 'RESULT', data: results })
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        // Signal the main thread to fall back to the backend Gemini API
        self.postMessage({ type: 'FALLBACK_REQUIRED', reason })
    }
}
