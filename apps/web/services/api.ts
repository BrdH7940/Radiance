import { MOCK_LATEX_CODE, LOADING_STEPS } from './mockData';

export interface AnalyzeResult {
  latexCode: string;
  pdfUrl: string;
}

export interface AIEditResult {
  newText: string;
}

/**
 * Simulates uploading a CV and JD to the backend for analysis.
 * Steps through multiple loading phases before resolving.
 */
export async function uploadAndAnalyze(
  _cv: File,
  _jd: string,
  onStep?: (stepIndex: number) => void,
): Promise<AnalyzeResult> {
  for (let i = 0; i < LOADING_STEPS.length; i++) {
    onStep?.(i);
    await delay(LOADING_STEPS[i].duration);
  }

  return {
    latexCode: MOCK_LATEX_CODE,
    pdfUrl: '/sample.pdf',
  };
}

/**
 * Simulates an AI rewrite of the selected text using the given prompt.
 */
export async function aiEditSelectedText(
  selectedText: string,
  prompt: string,
): Promise<AIEditResult> {
  await delay(1400);

  const rewritten = buildMockRewrite(selectedText, prompt);
  return { newText: rewritten };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMockRewrite(text: string, prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes('star')) {
    return (
      text.trim() +
      ' (Situation: identified the challenge; Task: defined the objective; ' +
      'Action: implemented the solution; Result: achieved measurable impact.)'
    );
  }

  if (lower.includes('quantif') || lower.includes('metric') || lower.includes('number')) {
    return text.trim().replace(/\.$/, '') + ', achieving a 35% improvement in key metrics.';
  }

  if (lower.includes('concis') || lower.includes('shorter') || lower.includes('brief')) {
    const words = text.trim().split(' ');
    return words.slice(0, Math.max(8, Math.floor(words.length * 0.6))).join(' ') + '.';
  }

  // Generic rewrite fallback
  return `[AI-Enhanced] ${text.trim()}`;
}
