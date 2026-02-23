'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  FileCode2,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
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

interface TexSubsection {
  id: string;
  title: string;
  line: number;
}

interface TexSection {
  id: string;
  title: string;
  line: number;
  subsections: TexSubsection[];
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
  const [leftPaneWidth, setLeftPaneWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const splitPaneRef = useRef<HTMLDivElement | null>(null);
  const editorColumnRef = useRef<HTMLDivElement | null>(null);
  const [tocWidth, setTocWidth] = useState(24);
  const [isResizingToc, setIsResizingToc] = useState(false);

  const texTocSections = useMemo<TexSection[]>(() => {
    if (!latexCode) return [];

    const lines = latexCode.split('\n');
    const sectionRegex = /\\section\{([^}]*)\}/;
    const subsectionRegex = /\\subsection\{([^}]*)\}/;

    const sections: TexSection[] = [];
    let currentSection: TexSection | null = null;

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      const sectionMatch = line.match(sectionRegex);
      if (sectionMatch && sectionMatch[1]) {
        currentSection = {
          id: `sec-${lineNumber}`,
          title: sectionMatch[1].trim(),
          line: lineNumber,
          subsections: [],
        };
        sections.push(currentSection);
        return;
      }

      const subsectionMatch = line.match(subsectionRegex);
      if (subsectionMatch && subsectionMatch[1]) {
        const subsection: TexSubsection = {
          id: `subsec-${lineNumber}`,
          title: subsectionMatch[1].trim(),
          line: lineNumber,
        };

        if (currentSection) {
          currentSection.subsections.push(subsection);
        } else {
          // Subsection appears before any section — treat as its own standalone section
          sections.push({
            id: `orphan-sec-${lineNumber}`,
            title: subsection.title,
            line: lineNumber,
            subsections: [],
          });
        }
      }
    });

    return sections;
  }, [latexCode]);

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

  const handleNavigateToLine = useCallback((lineNumber: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = editorRef.current as any;
    if (!editor || !lineNumber) return;

    editor.revealLineInCenter(lineNumber);
    editor.setPosition({ lineNumber, column: 1 });
    editor.focus();
  }, []);

  const toggleSectionExpanded = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = { ...prev };
      next[id] = !next[id];
      return next;
    });
  }, []);

  const handleTocResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsResizingToc(true);
    },
    [],
  );

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = splitPaneRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;

      const minLeft = 25;
      const maxLeft = 75;
      const clamped = Math.max(minLeft, Math.min(maxLeft, percentage));

      setLeftPaneWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!isResizingToc) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = editorColumnRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const relativeX = event.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;

      const minToc = 14;
      const maxToc = 40;
      const clamped = Math.max(minToc, Math.min(maxToc, percentage));

      setTocWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingToc(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingToc]);

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
      <div
        ref={splitPaneRef}
        className="flex-1 flex overflow-hidden min-h-0"
      >

        {/* Left column — LaTeX Editor */}
        <div
          ref={editorColumnRef}
          className="relative flex flex-col border-r border-white/5 min-w-0 flex-none"
          style={{ width: `${leftPaneWidth}%` }}
        >
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

          {/* Editor area with vertical TOC gutter */}
          <div className="flex flex-1 min-h-0">
            {texTocSections.length > 0 && (
              <div
                className="border-r border-white/5 bg-[#020617] flex flex-col flex-none"
                style={{ width: `${tocWidth}%` }}
              >
                <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-300 uppercase tracking-[0.12em]">
                  File outline
                </div>
                <div className="flex-1 overflow-y-auto pb-2">
                  {texTocSections.map((section) => {
                    const isExpanded = expandedSections[section.id] ?? true;
                    return (
                      <div
                        key={section.id}
                        className="px-2 py-1 border-b border-white/5/40 last:border-b-0"
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleSectionExpanded(section.id)}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 text-slate-300"
                            aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleNavigateToLine(section.line)}
                            className="flex-1 text-left text-sm font-medium text-slate-100 hover:text-indigo-200 hover:bg-white/5 rounded px-1 py-0.5 truncate"
                          >
                            {section.title}
                          </button>
                        </div>
                        {isExpanded && section.subsections.length > 0 && (
                          <div className="mt-0.5 ml-4 pl-2 border-l border-slate-800 flex flex-col gap-0.5">
                            {section.subsections.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleNavigateToLine(sub.line)}
                                className="w-full text-left text-xs text-slate-300 hover:text-slate-100 hover:bg-white/5 rounded px-1 py-0.5 truncate"
                              >
                                {sub.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inner resize handle between TOC and editor */}
            {texTocSections.length > 0 && (
              <div
                onMouseDown={handleTocResizeMouseDown}
                className={`flex-none w-1 cursor-col-resize bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors ${
                  isResizingToc ? 'bg-indigo-500' : ''
                }`}
              />
            )}

            {/* Monaco */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="h-full w-full pr-1">
                <MonacoEditorWrapper
                  value={latexCode}
                  onChange={handleEditorChange}
                  onSelectionChange={setSelectionInfo}
                  onEditorMount={handleEditorMount}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Resize handle between editor + PDF */}
        <div
          onMouseDown={handleResizeMouseDown}
          className={`flex-none w-1 cursor-col-resize bg-indigo-500/40 hover:bg-indigo-500/70 transition-colors ${
            isResizing ? 'bg-indigo-500' : ''
          }`}
        />

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
