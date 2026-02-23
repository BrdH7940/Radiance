'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  FileCode2,
  Zap,
  ChevronLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  SplitSquareHorizontal,
} from 'lucide-react';
import { NavBar } from '@/components/ui/NavBar';
import { MonacoEditorWrapper } from '@/components/editor/MonacoEditorWrapper';
import { FloatingAIMenu } from '@/components/editor/FloatingAIMenu';
import { PDFPreview } from '@/components/ui/PDFPreview';
import { useCVStore } from '@/store/useCVStore';
import { aiEditSelectedText } from '@/services/api';
import type { SelectionInfo } from '@/components/editor/MonacoEditorWrapper';

// ─── Notification ─────────────────────────────────────────────────────────────

type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: number;
  message: string;
  type: NotificationType;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();
  const { latexCode, setLatexCode } = useCVStore();

  // Local UI state
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifIdRef = useRef(0);

  // Monaco editor instance ref (populated via onEditorMount callback)
  const editorRef = useRef<unknown>(null);

  // ── Guard ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!latexCode) router.replace('/');
  }, [latexCode, router]);

  if (!latexCode) return null;

  // ── Notification helpers ──────────────────────────────────────────────────

  const showNotification = useCallback(
    (message: string, type: NotificationType = 'success') => {
      const id = ++notifIdRef.current;
      setNotifications((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setNotifications((prev) => prev.filter((n) => n.id !== id)),
        3500,
      );
    },
    [],
  );

  // ── Editor handlers ───────────────────────────────────────────────────────

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  const handleEditorChange = useCallback(
    (value: string) => setLatexCode(value),
    [setLatexCode],
  );

  // ── AI edit apply ─────────────────────────────────────────────────────────

  const handleAIApply = useCallback(
    (newText: string, monacoSelection: SelectionInfo['monacoSelection']) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editor = editorRef.current as any;
      if (!editor) return;

      editor.executeEdits('ai-rewrite', [
        {
          range: {
            startLineNumber: monacoSelection.startLineNumber,
            startColumn: monacoSelection.startColumn,
            endLineNumber: monacoSelection.endLineNumber,
            endColumn: monacoSelection.endColumn,
          },
          text: newText,
          forceMoveMarkers: true,
        },
      ]);

      // Clear selection and close menu
      setSelectionInfo(null);
      showNotification('AI rewrite applied!', 'success');
    },
    [showNotification],
  );

  // ── Toolbar actions ───────────────────────────────────────────────────────

  const handleCompile = useCallback(async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    await new Promise((r) => setTimeout(r, 1600));
    setIsCompiling(false);
    showNotification('PDF compiled successfully.', 'success');
  }, [isCompiling, showNotification]);

  const handleDownloadTex = useCallback(() => {
    const blob = new Blob([latexCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume.tex';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('resume.tex downloaded.', 'info');
  }, [latexCode, showNotification]);

  const handleDownloadPDF = useCallback(() => {
    showNotification(
      'PDF export requires the LaTeX compiler backend.',
      'error',
    );
  }, [showNotification]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-midnight">
      <NavBar activeStep={3} />

      {/* ── Workspace toolbar ───────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-midnight/80 backdrop-blur-xl">
        {/* Back */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-500 text-xs font-medium hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Upload
        </button>

        <div className="h-4 w-px bg-white/8" />

        {/* Pane label */}
        <div className="flex items-center gap-1.5 text-slate-600 text-xs">
          <SplitSquareHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:block">LaTeX Studio</span>
        </div>

        <div className="flex-1" />

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Compile PDF */}
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold
              border border-indigo-500/30 bg-indigo-600/10 text-indigo-300
              hover:bg-indigo-600/20 hover:border-indigo-500/50
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300
            "
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isCompiling ? 'animate-spin' : ''}`}
            />
            {isCompiling ? 'Compiling…' : 'Compile PDF'}
          </button>

          {/* Download .tex */}
          <button
            onClick={handleDownloadTex}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold
              border border-white/10 bg-white/5 text-slate-300
              hover:border-white/20 hover:bg-white/8
              transition-all duration-300
            "
          >
            <FileCode2 className="w-3.5 h-3.5" />
            .tex
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPDF}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded-2xl text-xs font-semibold
              border border-white/10 bg-white/5 text-slate-300
              hover:border-white/20 hover:bg-white/8
              transition-all duration-300
            "
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>

          {/* AI indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/5">
            <Zap className="w-3 h-3 text-violet-400" strokeWidth={2.5} />
            <span className="text-xs text-violet-400 font-medium">AI Ready</span>
          </div>
        </div>
      </div>

      {/* ── Split pane ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left column — LaTeX Editor */}
        <div className="relative flex-1 flex flex-col border-r border-white/5 min-w-0">
          {/* Column header */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#05070a]">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.5} />
              <span className="text-xs text-slate-600 font-medium font-mono">
                resume.tex
              </span>
            </div>
            {selectionInfo && (
              <div className="flex items-center gap-1.5 text-xs text-violet-400 animate-in fade-in duration-300">
                <Zap className="w-3 h-3" strokeWidth={2.5} />
                <span>
                  {selectionInfo.selectedText.split(/\s+/).filter(Boolean).length} words selected
                  — ask AI below
                </span>
              </div>
            )}
          </div>

          {/* Monaco */}
          <div className="flex-1 min-h-0">
            <MonacoEditorWrapper
              value={latexCode}
              onChange={handleEditorChange}
              onSelectionChange={setSelectionInfo}
              onEditorMount={handleEditorMount}
            />
          </div>
        </div>

        {/* Right column — PDF Preview */}
        <div className="flex-1 flex flex-col min-w-0">
          <PDFPreview latexCode={latexCode} isCompiling={isCompiling} />
        </div>
      </div>

      {/* ── Floating AI menu (Phase 3) ───────────────────────────────────── */}
      {selectionInfo && (
        <FloatingAIMenu
          selectionInfo={selectionInfo}
          onApply={handleAIApply}
          onClose={() => setSelectionInfo(null)}
          aiEdit={aiEditSelectedText}
        />
      )}

      {/* ── Toast notifications ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`
              flex items-center gap-2.5 px-4 py-3 rounded-2xl border text-sm font-medium
              shadow-xl animate-in slide-in-from-bottom-8 fade-in duration-300
              ${n.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
                : n.type === 'error'
                  ? 'bg-red-950/90 border-red-500/30 text-red-300'
                  : 'bg-slate-900/90 border-white/10 text-slate-300'
              }
            `}
          >
            {n.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : n.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Download className="w-4 h-4 shrink-0" />
            )}
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
}
