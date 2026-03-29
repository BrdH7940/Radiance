'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Sparkles, Loader2, X, Wand2, CornerDownLeft } from 'lucide-react';
import type { SelectionInfo } from './MonacoEditorWrapper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FloatingAIMenuProps {
  selectionInfo: SelectionInfo;
  onApply: (newText: string, selection: SelectionInfo['monacoSelection']) => void;
  onClose: () => void;
  /** Mock AI function — matches the contract in services/api.ts */
  aiEdit: (selectedText: string, prompt: string) => Promise<{ newText: string }>;
}

// ─── Quick-prompt suggestions ─────────────────────────────────────────────────

const QUICK_PROMPTS = [
  'Make it STAR format',
  'Add metrics & numbers',
  'Make it more concise',
  'Stronger action verbs',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingAIMenu({
  selectionInfo,
  onApply,
  onClose,
  aiEdit,
}: FloatingAIMenuProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-focus the input when the menu opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Position calculation ──────────────────────────────────────────────────

  const { top: rawTop, left: rawLeft } = selectionInfo.screenPosition;

  // Place menu above the selection cursor; clamp so it stays in viewport
  const MENU_HEIGHT = 180;
  const MENU_WIDTH = 440;
  const PADDING = 12;

  const clampedLeft = Math.max(
    PADDING,
    Math.min(rawLeft, window.innerWidth - MENU_WIDTH - PADDING),
  );

  // Prefer above; if not enough room, render below
  const spaceAbove = rawTop - PADDING;
  const top =
    spaceAbove >= MENU_HEIGHT
      ? rawTop - MENU_HEIGHT - 8
      : rawTop + 24; // below cursor line

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();

      const trimmed = prompt.trim();
      if (!trimmed || isLoading) return;

      setError(null);
      setIsLoading(true);

      try {
        const { newText } = await aiEdit(selectionInfo.selectedText, trimmed);
        onApply(newText, selectionInfo.monacoSelection);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI request failed — please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [aiEdit, isLoading, onApply, prompt, selectionInfo],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleQuickPrompt = useCallback(
    (suggestion: string) => {
      setPrompt(suggestion);
      inputRef.current?.focus();
    },
    [],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />

      {/* Floating menu */}
      <div
        ref={menuRef}
        role="dialog"
        aria-label="AI rewrite"
        style={{
          position: 'fixed',
          top,
          left: clampedLeft,
          width: MENU_WIDTH,
          zIndex: 50,
        }}
        className="animate-in fade-in slide-in-from-bottom-8 duration-300"
      >
        <div className="rounded-[2rem] border border-white/10 bg-[#0a0f18]/95 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" strokeWidth={2} />
              <span className="text-xs font-bold text-violet-400 tracking-wider">
                RADIANCE AI
              </span>
            </div>

            <div className="flex-1" />

            {/* Preview of selected text */}
            <span className="max-w-[180px] truncate text-xs text-slate-600 font-mono">
              &ldquo;{selectionInfo.selectedText.slice(0, 48)}{selectionInfo.selectedText.length > 48 ? '…' : ''}&rdquo;
            </span>

            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Quick prompts ───────────────────────────────────────────── */}
          <div className="flex gap-1.5 px-4 pt-3 flex-wrap">
            {QUICK_PROMPTS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleQuickPrompt(suggestion)}
                className="px-2.5 py-1 rounded-full text-xs text-slate-400 border border-white/8 hover:border-violet-500/40 hover:text-violet-300 hover:bg-violet-500/5 transition-all duration-200"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* ── Input row ───────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] focus-within:border-violet-500/40 transition-all duration-300">
              <Wand2 className="w-4 h-4 text-slate-600 shrink-0" strokeWidth={1.5} />
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask AI to rewrite this…"
                disabled={isLoading}
                className="flex-1 bg-transparent text-slate-200 text-sm placeholder:text-slate-700 outline-none min-w-0"
              />
            </div>

            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className={`
                flex items-center gap-1.5 px-4 py-2.5 rounded-[1.5rem] text-sm font-semibold
                transition-all duration-300 shrink-0
                ${prompt.trim() && !isLoading
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/30 hover:brightness-110'
                  : 'bg-white/5 text-slate-600 cursor-not-allowed'
                }
              `}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CornerDownLeft className="w-3.5 h-3.5" />
                  Generate
                </>
              )}
            </button>
          </form>

          {/* ── Loading / Error state ───────────────────────────────────── */}
          {(isLoading || error) && (
            <div className={`px-4 pb-3 text-xs ${error ? 'text-red-400' : 'text-slate-500'}`}>
              {isLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Rewriting with AI…
                </span>
              ) : (
                error
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
