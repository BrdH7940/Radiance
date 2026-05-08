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

function clampOneSentence(s: string): string {
    const cleaned = s
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!cleaned) return ''
    const first = cleaned.split(/[.?!]\s+/)[0]?.trim() ?? ''
    if (!first) return ''
    return first.endsWith('.') ? first : `${first}.`
}

function tokenizeLower(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean)
}

const STOPWORDS = new Set<string>([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'if',
    'then',
    'than',
    'so',
    'of',
    'to',
    'in',
    'on',
    'at',
    'by',
    'for',
    'with',
    'without',
    'as',
    'from',
    'into',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'it',
    'its',
    'they',
    'them',
    'their',
    'we',
    'our',
    'you',
    'your',
    'i',
    'my',
    'this',
    'that',
    'these',
    'those',
    'there',
    'here',
    'not',
    'no',
    'yes',
    'all',
    'any',
    'some',
    'each',
    'every',
    'both',
    'either',
    'neither',
    'can',
    'could',
    'should',
    'would',
    'will',
    'may',
    'might',
    'must',
])

function extractTopKeywords(text: string, limit: number): string[] {
    const freq = new Map<string, number>()
    for (const t of tokenizeLower(text)) {
        if (t.length < 3) continue
        if (STOPWORDS.has(t)) continue
        freq.set(t, (freq.get(t) ?? 0) + 1)
    }
    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k)
        .slice(0, limit)
}

function extractQuantSignals(text: string, limit: number): string[] {
    const s = text
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!s) return []

    const hits: string[] = []

    // Percentages, multipliers, timings, currency-ish.
    const patterns: RegExp[] = [
        /\b\d{1,3}\s?%\b/g,
        /\b\d+(\.\d+)?\s?x\b/gi,
        /\b\d+(\.\d+)?\s?(ms|s|sec|secs|seconds|minutes|mins|hours|hrs)\b/gi,
        /\b\d+(\.\d+)?\s?(rps|qps|tps)\b/gi,
        /\b\d+(\.\d+)?\s?(gb|mb|kb|tb)\b/gi,
        /\$\s?\d+([,.]\d+)?\b/g,
    ]
    for (const p of patterns) {
        const m = s.match(p)
        if (m) hits.push(...m)
    }

    // Action phrases that imply measurement.
    const phrase = s.match(
        /\b(reduced|improved|increased|cut|saved|lowered|decreased|optimized|optimised)\b[^.]{0,80}\b(latency|cost|throughput|errors?|memory|cold[- ]start|bundle|load time|response time)\b[^.]{0,60}/gi
    )
    if (phrase) hits.push(...phrase.map((x) => clampOneSentence(x)))

    // Deduplicate while preserving order.
    const seen = new Set<string>()
    const uniq = hits
        .map((h) => h.trim())
        .filter(Boolean)
        .filter((h) => {
            const key = h.toLowerCase()
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })

    return uniq.slice(0, limit)
}

/**
 * Deterministic, grounded fallback when the generative reasoning is rejected.
 * Uses only the JD + project (title/description/tech_stack) and Phase-1 embedder.
 */
async function buildExtractiveReasoning(
    jdText: string,
    item: ProjectItem,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedder: any,
    jdEmbedding: number[],
    fitScore: number
): Promise<string> {
    const DEFAULT =
        'Relevant technical experience matches the job requirements.'

    const jdTokens = new Set(tokenizeLower(jdText))
    const techOverlap = item.tech_stack.filter((t) => {
        const toks = tokenizeLower(t)
        return toks.some((tok) => jdTokens.has(tok))
    })

    const projectCorpus = `${item.title} ${item.description ?? ''} ${item.tech_stack.join(' ')}`
    const jdTop = extractTopKeywords(jdText, 12)
    const projectVocab = new Set(tokenizeLower(projectCorpus))
    const missingFromProject = jdTop
        .filter((k) => !projectVocab.has(k))
        .slice(0, 4)
    const extraTech = item.tech_stack
        .filter((t) => !tokenizeLower(t).some((tok) => jdTokens.has(tok)))
        .slice(0, 3)

    const pickSentence = async (): Promise<string> => {
        const desc = (item.description ?? '').replace(/\r\n/g, '\n').trim()
        if (!desc) return ''
        const candidates = desc
            .split(/[\n.?!]+/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 30)
            .slice(0, 12)
        if (candidates.length === 0) return ''

        let best = ''
        let bestScore = -1
        for (const s of candidates) {
            const emb: number[] = Array.from(
                (await embedder(s, { pooling: 'mean', normalize: true }))
                    .data as Float32Array
            )
            const score = cosineSimilarity(jdEmbedding, emb)
            if (score > bestScore) {
                bestScore = score
                best = s
            }
        }
        return clampOneSentence(best)
    }

    const sentence = await pickSentence()
    const quantSignals = extractQuantSignals(projectCorpus, 2)

    const relevantBits: string[] = []
    if (techOverlap.length > 0)
        relevantBits.push(`Relevant: ${techOverlap.slice(0, 4).join(', ')}`)
    if (sentence) relevantBits.push(`Evidence: ${sentence}`)
    if (quantSignals.length > 0) {
        relevantBits.push(
            `Some quantified outcomes: ${quantSignals.join(' | ')}`
        )
    } else {
        relevantBits.push(
            'However, there are no quantified outcomes mentioned in the project text.'
        )
    }

    const irrelevantBits: string[] = []
    if (missingFromProject.length > 0) {
        irrelevantBits.push(
            `Missing JD signals: ${missingFromProject.join(', ')}`
        )
    }
    if (extraTech.length > 0) {
        irrelevantBits.push(`Less relevant tech: ${extraTech.join(', ')}`)
    }

    const isLowFit = fitScore < 0.25
    const headline = isLowFit
        ? 'This project looks weakly aligned to the JD.'
        : 'This project has some alignment with the JD.'

    const combined =
        `${headline} ${relevantBits.join('. ')}. ${irrelevantBits.join('. ')}.`.replace(
            /\s+/g,
            ' '
        )
    return combined.trim().length >= 40 ? combined.trim() : DEFAULT
}

function extractReasoning(raw: string): string {
    const DEFAULT =
        'Relevant technical experience matches the job requirements.'

    const cleaned = raw
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .trim()

    if (!cleaned) return DEFAULT

    // Some small instruct models respond with JSON (or a JSON-like blob).
    // Try to parse and pull a likely field.
    const jsonCandidateMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonCandidateMatch?.[0]) {
        try {
            const obj = JSON.parse(jsonCandidateMatch[0]) as Record<
                string,
                unknown
            >
            const picked =
                (typeof obj.reasoning === 'string' && obj.reasoning) ||
                (typeof obj.reason === 'string' && obj.reason) ||
                (typeof obj.explanation === 'string' && obj.explanation) ||
                ''
            const s = picked.trim()
            if (s.length >= 10) return s
        } catch {
            // Ignore parse failures; we'll sanitize below.
        }
    }

    // Strip wrapping quotes/backticks and obvious list/dash artifacts.
    const unwrapped = cleaned
        .replace(/^[`"'“”‘’]+/, '')
        .replace(/[`"'“”‘’]+$/, '')
        .replace(/^\s*[-–—]\s*/, '')
        .trim()

    if (unwrapped.length >= 10) return unwrapped

    // Fallback: take first non-empty sentence-like chunk.
    const sentence = cleaned
        .split(/[\n.?!]/)
        .map((s) => s.trim())
        .find((s) => s.length >= 10)

    return sentence ?? DEFAULT
}

// ─── Faithfulness gate ───────────────────────────────────────────────────────
//
// Tiny generative LMs (135M params) cannot reliably stay grounded to the prompt;
// they confabulate plausible-sounding tech and proper nouns. We can't stop the
// generation, but we can detect post-hoc that the output strayed: every salient
// token (proper nouns, mixed-case tech names, things with digits or technical
// separators) must trace back to the JD or project source. Anything else is
// treated as a hallucination and the whole sentence is rejected.

/**
 * Common English glue / project-domain words that may appear in a recruiter
 * sentence without being a real-world entity. Lowercased.
 */
const GENERIC_ALLOWLIST = new Set<string>([
    // Articles, pronouns, copulas, conjunctions
    'the',
    'a',
    'an',
    'this',
    'that',
    'these',
    'those',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'am',
    'and',
    'or',
    'but',
    'if',
    'so',
    'than',
    'then',
    'with',
    'without',
    'for',
    'in',
    'on',
    'at',
    'to',
    'from',
    'by',
    'of',
    'as',
    'into',
    'onto',
    'about',
    'across',
    'over',
    'under',
    'between',
    'through',
    'it',
    'its',
    'they',
    'them',
    'their',
    'there',
    'here',
    'he',
    'she',
    'his',
    'her',
    'we',
    'our',
    'you',
    'your',
    'i',
    'my',
    'who',
    'whom',
    'which',
    'what',
    'where',
    'when',
    'why',
    'how',
    // Auxiliary / modal verbs
    'have',
    'has',
    'had',
    'having',
    'do',
    'does',
    'did',
    'doing',
    'will',
    'would',
    'could',
    'should',
    'shall',
    'may',
    'might',
    'must',
    'can',
    'cannot',
    // Generic verbs that show up in recruiter prose
    'use',
    'used',
    'using',
    'apply',
    'applied',
    'applying',
    'build',
    'built',
    'building',
    'create',
    'created',
    'creating',
    'develop',
    'developed',
    'developing',
    'design',
    'designed',
    'designing',
    'implement',
    'implemented',
    'implementing',
    'integrate',
    'integrated',
    'integrating',
    'manage',
    'managed',
    'managing',
    'lead',
    'led',
    'leading',
    'work',
    'worked',
    'working',
    'demonstrate',
    'demonstrated',
    'demonstrating',
    'demonstrates',
    'show',
    'showed',
    'shown',
    'shows',
    'showing',
    'address',
    'addressed',
    'addressing',
    'addresses',
    'align',
    'aligned',
    'aligning',
    'aligns',
    'match',
    'matched',
    'matching',
    'matches',
    'fit',
    'fits',
    'fitting',
    'relate',
    'related',
    'relating',
    'relates',
    'leverage',
    'leveraged',
    'leveraging',
    'leverages',
    'highlight',
    'highlights',
    'highlighted',
    'highlighting',
    'require',
    'required',
    'requires',
    'requiring',
    'support',
    'supports',
    'supported',
    'supporting',
    'provide',
    'provides',
    'provided',
    'providing',
    'include',
    'includes',
    'included',
    'including',
    'involve',
    'involves',
    'involved',
    'involving',
    'make',
    'makes',
    'made',
    'making',
    'take',
    'takes',
    'took',
    'taking',
    'enable',
    'enables',
    'enabled',
    'enabling',
    'help',
    'helps',
    'helped',
    'helping',
    'ensure',
    'ensures',
    'ensured',
    'ensuring',
    'deliver',
    'delivers',
    'delivered',
    'delivering',
    'improve',
    'improves',
    'improved',
    'improving',
    'optimize',
    'optimizes',
    'optimized',
    'optimizing',
    'optimise',
    'optimises',
    'optimised',
    'optimising',
    // Generic project / recruiter nouns
    'project',
    'projects',
    'job',
    'jobs',
    'role',
    'roles',
    'position',
    'positions',
    'description',
    'descriptions',
    'requirement',
    'requirements',
    'experience',
    'experiences',
    'expertise',
    'skill',
    'skills',
    'knowledge',
    'candidate',
    'candidates',
    'recruiter',
    'recruiters',
    'team',
    'teams',
    'system',
    'systems',
    'feature',
    'features',
    'tool',
    'tools',
    'data',
    'service',
    'services',
    'application',
    'applications',
    'app',
    'apps',
    'platform',
    'platforms',
    'database',
    'databases',
    'api',
    'apis',
    'framework',
    'frameworks',
    'library',
    'libraries',
    'language',
    'languages',
    'technology',
    'technologies',
    'tech',
    'stack',
    'architecture',
    'architectures',
    'solution',
    'solutions',
    'product',
    'products',
    'company',
    'companies',
    'industry',
    'industries',
    'domain',
    'domains',
    'field',
    'fields',
    'task',
    'tasks',
    'goal',
    'goals',
    'outcome',
    'outcomes',
    'result',
    'results',
    'process',
    'processes',
    'workflow',
    'workflows',
    'pipeline',
    'pipelines',
    'environment',
    'environments',
    'production',
    'development',
    'developer',
    'developers',
    'engineer',
    'engineers',
    'engineering',
    'software',
    'hardware',
    'user',
    'users',
    'client',
    'clients',
    'customer',
    'customers',
    'web',
    'mobile',
    'cloud',
    'frontend',
    'backend',
    'fullstack',
    'full-stack',
    'code',
    'codebase',
    'repository',
    'repositories',
    'repo',
    'repos',
    'function',
    'functions',
    'method',
    'methods',
    'class',
    'classes',
    'component',
    'components',
    'module',
    'modules',
    'package',
    'packages',
    'test',
    'tests',
    'testing',
    'tested',
    'documentation',
    'docs',
    // Common adverbs / qualifiers
    'directly',
    'specifically',
    'particularly',
    'effectively',
    'efficiently',
    'successfully',
    'recently',
    'currently',
    'previously',
    'extensively',
    'strong',
    'strongly',
    'closely',
    'highly',
    'very',
    'much',
    'most',
    'more',
    'less',
    'good',
    'great',
    'better',
    'best',
    'key',
    'core',
    'main',
    'primary',
    'secondary',
    'similar',
    'similarly',
    'related',
    'relevant',
    'relevance',
    'because',
    'since',
    'while',
    'whereas',
    'although',
    'though',
    'one',
    'two',
    'three',
    'first',
    'second',
    'third',
    'multiple',
    'several',
    'many',
    'each',
    'all',
    'any',
    'some',
    'both',
    'either',
    'neither',
    'every',
    'no',
    'not',
    'such',
    's', // possessive 's' fragment after tokenisation
])

/** Add common plural/singular forms to a vocab set. */
function addInflections(token: string, vocab: Set<string>): void {
    vocab.add(token)
    if (token.length > 3) {
        if (token.endsWith('ies')) vocab.add(token.slice(0, -3) + 'y')
        if (token.endsWith('es')) vocab.add(token.slice(0, -2))
        if (token.endsWith('s')) vocab.add(token.slice(0, -1))
        if (token.endsWith('ed')) vocab.add(token.slice(0, -2))
        if (token.endsWith('ing')) vocab.add(token.slice(0, -3))
        // also add common pluralisations of the bare form
        vocab.add(token + 's')
        vocab.add(token + 'es')
    }
}

/**
 * Tokenise text for the source-vocab and reasoning checks.
 * Preserves `.`, `/`, `-`, `+`, `#` mid-token so things like `S3`, `CI/CD`,
 * `.NET`, `C++`, `C#`, `socket-io` survive intact.
 */
function tokenizeForVocab(text: string): string[] {
    return (
        text
            // Drop characters that are never part of a token (commas, parens, quotes…)
            .replace(/[^\p{L}\p{N}\s./\-+#]/gu, ' ')
            .split(/\s+/)
            .filter(Boolean)
            // Trim leading/trailing punctuation that wouldn't be part of the token
            .map((t) => t.replace(/^[./\-+#]+|[./\-+#]+$/g, ''))
            .filter(Boolean)
    )
}

/**
 * Build the lowercased token set the model is allowed to "quote" from.
 * Sources: the JD excerpt the model actually saw + project title +
 * project description + every entry in tech_stack.
 */
function buildSourceVocab(jd: string, item: ProjectItem): Set<string> {
    const corpus = [
        jd,
        item.title,
        item.description ?? '',
        item.tech_stack.join(' '),
    ]
        .join(' ')
        .toLowerCase()

    const vocab = new Set<string>()
    for (const tok of tokenizeForVocab(corpus)) {
        addInflections(tok, vocab)
    }
    return vocab
}

/**
 * Decide whether a single token from the model output must be traceable to
 * the source vocabulary, and if so whether it actually is.
 *
 * Returns true → token looks like a hallucinated entity / tech term.
 * Returns false → token is grounded, generic English, or sentence-initial.
 */
function isSalientUnknown(
    token: string,
    position: number,
    vocab: Set<string>
): boolean {
    const lower = token.toLowerCase()
    if (vocab.has(lower)) return false
    if (GENERIC_ALLOWLIST.has(lower)) return false

    // Pure number — fine if not in source (e.g. "one sentence", word-count quirks).
    if (/^\d+$/.test(token)) return false

    const startsCapital = /^[A-Z]/.test(token)
    const hasInternalCapital =
        /^[A-Za-z]+[A-Z]/.test(token.slice(1)) || /[a-z][A-Z]/.test(token)
    const hasDigit = /\d/.test(token)
    const hasSeparator = /[./\-+#]/.test(token)

    // Sentence-initial capitalised word ("This", "Project", "Working") is normal English.
    // Allow it through; if it were a real proper noun it would still need to be
    // grounded, but the leading-cap heuristic alone is too noisy at position 0.
    if (
        position === 0 &&
        startsCapital &&
        !hasInternalCapital &&
        !hasDigit &&
        !hasSeparator
    ) {
        return false
    }

    // Anything mixed-case / digit-bearing / separator-bearing is almost certainly
    // a tech term or proper noun and must be grounded.
    if (hasInternalCapital || hasDigit || hasSeparator) return true

    // Capitalised word not at the sentence start — likely a proper noun.
    if (startsCapital) return true

    // Lowercase unknown word: we don't have a full English dictionary, so accept it.
    return false
}

/**
 * Walk every token in a generated reasoning sentence; reject the whole sentence
 * on the first salient-unknown hit.
 */
function passesFaithfulnessGate(
    reasoning: string,
    jd: string,
    item: ProjectItem
): { ok: true } | { ok: false; rejected: string } {
    const vocab = buildSourceVocab(jd, item)
    const tokens = tokenizeForVocab(reasoning)
    for (let i = 0; i < tokens.length; i++) {
        if (isSalientUnknown(tokens[i], i, vocab)) {
            return { ok: false, rejected: tokens[i] }
        }
    }
    return { ok: true }
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

        // Dynamic import so a load failure is catchable.
        // IMPORTANT: do not import from a CDN URL here — webpack can't bundle an external ESM
        // module into a Worker reliably in Next.js dev, which causes compile/runtime errors.
        const { pipeline, env } = await import('@huggingface/transformers')

        // Disable local model caching in the worker context
        env.allowLocalModels = false
        env.useBrowserCache = true

        const embedder = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2',
            // Some Transformers.js pipeline options are not reflected in TS types yet.
            { quantized: true } as unknown as Record<string, unknown>
        )

        const jdEmbedding: number[] = Array.from(
            (await embedder(jd, { pooling: 'mean', normalize: true }))
                .data as Float32Array
        )

        const scored: Array<{ item: ProjectItem; score: number }> = []
        for (const item of gallery) {
            const text = buildProjectText(item)
            const emb: number[] = Array.from(
                (await embedder(text, { pooling: 'mean', normalize: true }))
                    .data as Float32Array
            )
            scored.push({ item, score: cosineSimilarity(jdEmbedding, emb) })
        }

        const top5 = scored.sort((a, b) => b.score - a.score).slice(0, 5)

        // ── Phase 2: Reasoning ────────────────────────────────────────────────
        self.postMessage({ type: 'PROGRESS', step: 2 })

        const generator = await pipeline(
            'text-generation',
            'HuggingFaceTB/SmolLM2-135M-Instruct',
            // Some Transformers.js pipeline options are not reflected in TS types yet.
            { dtype: 'q4' } as unknown as Record<string, unknown>
        )

        const results: ClientAIResult[] = []

        for (const { item, score } of top5) {
            // SmolLM2-Instruct is a chat-tuned model — it only follows instructions
            // when fed through the chat template (i.e. as a messages array). Passing
            // a raw string causes it to treat the prompt as plain text to continue,
            // which produces empty / repetitive output on a 135M model.
            const messages = [
                {
                    role: 'system',
                    content:
                        'You are a senior technical recruiter. Reply with exactly one concise sentence ' +
                        '(no preface, no quotes, no list) that explains why a candidate project is relevant ' +
                        'to the given job description.',
                },
                {
                    role: 'user',
                    content:
                        `Job Description (excerpt):\n${jd.slice(0, 600)}\n\n` +
                        `Candidate Project:\n${buildProjectText(item)}\n\n` +
                        `Why is this project relevant to the job? One sentence only.`,
                },
            ]

            // Always provide a grounded explanation (relevant + irrelevant parts).
            let reasoning = await buildExtractiveReasoning(
                jd.slice(0, 600),
                item,
                embedder,
                jdEmbedding,
                score
            )
            try {
                const out = await generator(messages, {
                    max_new_tokens: 80,
                    do_sample: true,
                    temperature: 0.4,
                    top_p: 0.9,
                    repetition_penalty: 1.3,
                    no_repeat_ngram_size: 4,
                    return_full_text: false,
                } as unknown as Record<string, unknown>)

                // v3 chat-mode shape: [{ generated_text: [...messages, { role: 'assistant', content }] }]
                // String-mode shape (with return_full_text:false): [{ generated_text: '<completion>' }]
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const first = (out as any)?.[0]?.generated_text
                let assistant = ''
                if (Array.isArray(first)) {
                    const last = first[first.length - 1]
                    assistant =
                        typeof last?.content === 'string' ? last.content : ''
                } else if (typeof first === 'string') {
                    assistant = first
                }
                const candidate = extractReasoning(assistant)

                // Faithfulness gate: a 135M model will confidently invent tech
                // terms / proper nouns. If anything in the candidate sentence
                // can't be traced back to the JD or project source, throw the
                // whole sentence away and use the deterministic placeholder.
                const verdict = passesFaithfulnessGate(candidate, jd, item)
                if (verdict.ok) {
                    // Only append if it adds something beyond the deterministic analysis.
                    if (
                        candidate.length >= 25 &&
                        !reasoning
                            .toLowerCase()
                            .includes(candidate.toLowerCase())
                    ) {
                        reasoning = `${reasoning} Summary: ${candidate}`
                            .replace(/\s+/g, ' ')
                            .trim()
                    }
                } else {
                    console.warn(
                        '[ai.worker] hallucination gate rejected reasoning for project',
                        item.id,
                        '— unknown token:',
                        verdict.rejected,
                        '— sentence:',
                        candidate
                    )
                }
            } catch (e) {
                console.warn(
                    '[ai.worker] reasoning failed for project',
                    item.id,
                    e
                )
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
