import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { LOADING_STEPS } from '@/services/mockData'
import type { AnalysisResultDTO, ClientAIResult, CVResumeSchema, GalleryPhase, ProjectItem } from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppPhase = 'upload' | 'analyzing' | 'dashboard' | 'workspace'

export type AnalysisResultState = AnalysisResultDTO

export interface CVStore {
    // Auth state (synced from Supabase via SupabaseAuthListener)
    user: User | null
    /** True after the first client-side session check completes (for static-export guards). */
    authHydrated: boolean

    // Input data
    cvFile: File | null
    jdText: string

    // Async job
    jobId: string | null
    analysisResult: AnalysisResultState | null

    // Workspace data (populated when entering workspace from dashboard)
    cvData: CVResumeSchema | null
    pdfUrl: string

    // UI state (legacy flow)
    phase: AppPhase
    loadingStepIndex: number
    loadingSteps: typeof LOADING_STEPS
    inputReviewMode: boolean

    // ── Gallery FSM (parallel to legacy phase, does not break existing flow) ──
    /** Current FSM phase for the Strategic Gallery enhancement flow. */
    galleryPhase: GalleryPhase
    /**
     * Loading sub-step within ANALYZING phase.
     *   0 = idle, 1 = "Ranking Projects...", 2 = "Generating AI Reasoning..."
     */
    galleryLoadingStep: 0 | 1 | 2
    /** The user's full project gallery, fetched once at startup and cached here. */
    projectGallery: ProjectItem[]
    /** The Supabase user id that `projectGallery` currently belongs to. */
    galleryOwnerUserId: string | null
    /** Top-5 ranked projects returned by the WebWorker or fallback API. */
    recommendedProjects: ClientAIResult[]
    /** Project IDs the user explicitly checked in the ProjectSelectionHub. */
    selectedProjectIds: string[]
    /** Non-empty when galleryPhase === 'ERROR'. */
    galleryError: string

    // Legacy actions
    setUser: (user: User | null) => void
    setAuthHydrated: (hydrated: boolean) => void
    setCvFile: (file: File | null) => void
    /**
     * Sets the JD text.
     * FSM side-effect: if galleryPhase is 'CONSULTING_GALLERY', automatically
     * resets the gallery so stale AI reasoning is never shown for the new JD.
     */
    setJdText: (text: string) => void
    setJobId: (id: string | null) => void
    setAnalysisResult: (result: AnalysisResultState | null) => void
    setCvData: (data: CVResumeSchema | null) => void
    setPdfUrl: (url: string) => void
    setPhase: (phase: AppPhase) => void
    setLoadingStepIndex: (index: number) => void
    setInputReviewMode: (enabled: boolean) => void
    reset: () => void

    // Gallery FSM actions
    /** IDLE → ANALYZING. Call before launching the WebWorker. */
    startGalleryAnalysis: () => void
    /** ANALYZING → CONSULTING_GALLERY. Populates recommendedProjects. */
    consultGallery: (results: ClientAIResult[]) => void
    /** Update which projects the user has checked in the SelectionHub. */
    setSelectedProjectIds: (ids: string[]) => void
    /** CONSULTING_GALLERY → FINALIZING. Called after the backend job is queued. */
    finalizeGallery: () => void
    /** Any → IDLE. Clears all gallery state; call when user goes back / changes JD. */
    resetGallery: () => void
    /** Any → ERROR. Stores the error message for display. */
    setGalleryError: (message: string) => void
    /** Populate `projectGallery` from the API (called once on dashboard mount). */
    setProjectGallery: (items: ProjectItem[], ownerUserId: string) => void
    /** Update galleryLoadingStep during the ANALYZING phase. */
    setGalleryLoadingStep: (step: 0 | 1 | 2) => void
}

// ─── Initial state ────────────────────────────────────────────────────────────

const galleryInitialState = {
    galleryPhase: 'IDLE' as GalleryPhase,
    galleryLoadingStep: 0 as const,
    projectGallery: [] as ProjectItem[],
    galleryOwnerUserId: null as string | null,
    recommendedProjects: [] as ClientAIResult[],
    selectedProjectIds: [] as string[],
    galleryError: '',
}

const initialState: Pick<
    CVStore,
    | 'user'
    | 'authHydrated'
    | 'cvFile'
    | 'jdText'
    | 'jobId'
    | 'analysisResult'
    | 'cvData'
    | 'pdfUrl'
    | 'phase'
    | 'loadingStepIndex'
    | 'loadingSteps'
    | 'inputReviewMode'
> = {
    user: null,
    authHydrated: false,
    cvFile: null,
    jdText: '',
    jobId: null,
    analysisResult: null,
    cvData: null,
    pdfUrl: '',
    phase: 'upload' as AppPhase,
    loadingStepIndex: 0,
    loadingSteps: LOADING_STEPS,
    inputReviewMode: false,
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCVStore = create<CVStore>((set) => ({
    ...initialState,
    ...galleryInitialState,

    // ── Legacy actions ─────────────────────────────────────────────────────────
    setUser: (user) => set({ user }),
    setAuthHydrated: (authHydrated) => set({ authHydrated }),
    setCvFile: (file) => set({ cvFile: file }),

    setJdText: (text) =>
        set((state) => {
            // FSM guard: editing the JD while the user is reviewing AI suggestions
            // would cause stale reasoning to be shown — reset gallery automatically.
            if (state.galleryPhase === 'CONSULTING_GALLERY') {
                return { jdText: text, ...galleryInitialState }
            }
            return { jdText: text }
        }),

    setJobId: (id) => set({ jobId: id }),
    setAnalysisResult: (result) => set({ analysisResult: result }),
    setCvData: (data) => set({ cvData: data }),
    setPdfUrl: (url) => set({ pdfUrl: url }),
    setPhase: (phase) => set({ phase }),
    setLoadingStepIndex: (index) => set({ loadingStepIndex: index }),
    setInputReviewMode: (inputReviewMode) => set({ inputReviewMode }),

    // reset() only clears CV-analysis state — user auth and project gallery are preserved.
    reset: () =>
        set((state) => ({
            ...initialState,
            user: state.user,
            loadingSteps: LOADING_STEPS,
            // Preserve projectGallery so it isn't re-fetched on every reset
            projectGallery: state.projectGallery,
            galleryOwnerUserId: state.galleryOwnerUserId,
            galleryPhase: 'IDLE' as GalleryPhase,
            galleryLoadingStep: 0 as const,
            recommendedProjects: [],
            selectedProjectIds: [],
            galleryError: '',
        })),

    // ── Gallery FSM actions ────────────────────────────────────────────────────

    startGalleryAnalysis: () =>
        set({
            galleryPhase: 'ANALYZING',
            galleryLoadingStep: 0,
            recommendedProjects: [],
            selectedProjectIds: [],
            galleryError: '',
        }),

    consultGallery: (results) =>
        set({
            galleryPhase: 'CONSULTING_GALLERY',
            galleryLoadingStep: 0,
            recommendedProjects: results,
            selectedProjectIds: results.map((r) => r.project_id),
        }),

    setSelectedProjectIds: (ids) => set({ selectedProjectIds: ids }),

    finalizeGallery: () => set({ galleryPhase: 'FINALIZING' }),

    resetGallery: () =>
        set({
            galleryPhase: 'IDLE',
            galleryLoadingStep: 0,
            recommendedProjects: [],
            selectedProjectIds: [],
            galleryError: '',
        }),

    setGalleryError: (message) => set({ galleryPhase: 'ERROR', galleryError: message }),

    setProjectGallery: (items, ownerUserId) =>
        set({
            projectGallery: items,
            galleryOwnerUserId: ownerUserId,
        }),

    setGalleryLoadingStep: (step) => set({ galleryLoadingStep: step }),
}))

