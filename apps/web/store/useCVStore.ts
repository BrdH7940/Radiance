import { create } from 'zustand';
import { LOADING_STEPS } from '@/services/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppPhase = 'upload' | 'analyzing' | 'workspace';

export interface CVStore {
  // Input data
  cvFile: File | null;
  jdText: string;

  // Workspace data
  latexCode: string;
  pdfUrl: string;

  // UI state
  phase: AppPhase;
  loadingStepIndex: number;
  loadingSteps: typeof LOADING_STEPS;

  // Actions
  setCvFile: (file: File | null) => void;
  setJdText: (text: string) => void;
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
  setLatexCode: (code) => set({ latexCode: code }),
  setPdfUrl: (url) => set({ pdfUrl: url }),
  setPhase: (phase) => set({ phase }),
  setLoadingStepIndex: (index) => set({ loadingStepIndex: index }),

  reset: () => set(initialState),
}));
