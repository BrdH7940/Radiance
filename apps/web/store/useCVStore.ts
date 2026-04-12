import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { LOADING_STEPS } from '@/services/mockData'
import type { AnalysisResultDTO, CVResumeSchema } from '@/services/api'

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

    // UI state
    phase: AppPhase
    loadingStepIndex: number
    loadingSteps: typeof LOADING_STEPS

    // Actions
    setUser: (user: User | null) => void
    setAuthHydrated: (hydrated: boolean) => void
    setCvFile: (file: File | null) => void
    setJdText: (text: string) => void
    setJobId: (id: string | null) => void
    setAnalysisResult: (result: AnalysisResultState | null) => void
    setCvData: (data: CVResumeSchema | null) => void
    setPdfUrl: (url: string) => void
    setPhase: (phase: AppPhase) => void
    setLoadingStepIndex: (index: number) => void
    reset: () => void
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: Pick<CVStore, 'user' | 'authHydrated' | 'cvFile' | 'jdText' | 'jobId' | 'analysisResult' | 'cvData' | 'pdfUrl' | 'phase' | 'loadingStepIndex' | 'loadingSteps'> = {
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
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCVStore = create<CVStore>((set) => ({
    ...initialState,

    setUser: (user) => set({ user }),
    setAuthHydrated: (authHydrated) => set({ authHydrated }),
    setCvFile: (file) => set({ cvFile: file }),
    setJdText: (text) => set({ jdText: text }),
    setJobId: (id) => set({ jobId: id }),
    setAnalysisResult: (result) => set({ analysisResult: result }),
    setCvData: (data) => set({ cvData: data }),
    setPdfUrl: (url) => set({ pdfUrl: url }),
    setPhase: (phase) => set({ phase }),
    setLoadingStepIndex: (index) => set({ loadingStepIndex: index }),

    // reset() only clears CV-analysis state — user auth is preserved.
    reset: () =>
        set((state) => ({
            ...initialState,
            user: state.user,
            loadingSteps: LOADING_STEPS,
        })),
}))
