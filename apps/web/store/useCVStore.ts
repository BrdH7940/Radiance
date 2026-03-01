import { create } from 'zustand';
import { LOADING_STEPS } from '@/services/mockData';
import type { AnalysisResultDTO } from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppPhase = 'upload' | 'analyzing' | 'dashboard' | 'workspace';

/** Analysis result shown on the dashboard; matches backend AnalysisResultDTO. */
export type AnalysisResultState = AnalysisResultDTO;

export interface CVStore {
  // Input data
  cvFile: File | null;
  jdText: string;

  // Async job
  jobId: string | null;
  analysisResult: AnalysisResultState | null;

  // Workspace data (populated when entering workspace from dashboard)
  latexCode: string;
  pdfUrl: string;

  // UI state
  phase: AppPhase;
  loadingStepIndex: number;
  loadingSteps: typeof LOADING_STEPS;

  // Actions
  setCvFile: (file: File | null) => void;
  setJdText: (text: string) => void;
  setJobId: (id: string | null) => void;
  setAnalysisResult: (result: AnalysisResultState | null) => void;
  setLatexCode: (code: string) => void;
  setPdfUrl: (url: string) => void;
  setPhase: (phase: AppPhase) => void;
  setLoadingStepIndex: (index: number) => void;
  reset: () => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState = {
  cvFile: null,
  jdText: '',
  jobId: null,
  analysisResult: null,
  latexCode: '',
  pdfUrl: '',
  phase: 'upload' as AppPhase,
  loadingStepIndex: 0,
  loadingSteps: LOADING_STEPS,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCVStore = create<CVStore>((set) => ({
  ...initialState,

  setCvFile: (file) => set({ cvFile: file }),
  setJdText: (text) => set({ jdText: text }),
  setJobId: (id) => set({ jobId: id }),
  setAnalysisResult: (result) => set({ analysisResult: result }),
  setLatexCode: (code) => set({ latexCode: code }),
  setPdfUrl: (url) => set({ pdfUrl: url }),
  setPhase: (phase) => set({ phase }),
  setLoadingStepIndex: (index) => set({ loadingStepIndex: index }),

  reset: () => set(initialState),
}));
