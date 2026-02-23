'use client';

import { useMemo, useState, useCallback } from 'react';
import { Loader2, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── LaTeX parser ─────────────────────────────────────────────────────────────

interface ParsedEntry {
  title: string;
  subtitle?: string;
  date?: string;
  bullets: string[];
}

interface ParsedSection {
  title: string;
  entries: ParsedEntry[];
  summary?: string;
  tableRows?: string[][];
}

interface ParsedCV {
  name: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  sections: ParsedSection[];
}

function stripLatex(text: string): string {
  return text
    .replace(/\\href\{[^}]+\}\{([^}]+)\}/g, '$1')
    .replace(/\\textbf\{([^}]+)\}/g, '$1')
    .replace(/\\textit\{([^}]+)\}/g, '$1')
    .replace(/\\color\{[^}]+\}/g, '')
    .replace(/\\hfill\s*/g, ' · ')
    .replace(/\\\\/, '')
    .replace(/\\[a-zA-Z@]+\*?\s*/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractItems(block: string): string[] {
  const matches = Array.from(block.matchAll(/\\item\s+([\s\S]+?)(?=\\item|\\end\{|$)/g));
  return matches
    .map((m) => stripLatex(m[1]).replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

function parseSection(title: string, content: string): ParsedSection {
  const lowerTitle = title.toLowerCase();

  // ── Summary block ──────────────────────────────────────────────────────────
  if (lowerTitle.includes('summary')) {
    const text = stripLatex(content).replace(/\s+/g, ' ').trim();
    return { title, entries: [], summary: text };
  }

  // ── Skills / tabular ───────────────────────────────────────────────────────
  if (lowerTitle.includes('skill')) {
    const tabMatch = content.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/);
    if (tabMatch) {
      const rows = tabMatch[0]
        .split('\\\\')
        .map((row) =>
          row
            .split('&')
            .map((cell) => stripLatex(cell).trim())
            .filter(Boolean),
        )
        .filter((r) => r.length >= 2);
      return { title, entries: [], tableRows: rows };
    }
  }

  // ── Experience / Education — entry blocks separated by \vspace ────────────
  const blocks = content.split(/\\vspace\{[^}]+\}/).filter((b) => b.trim());
  const entries: ParsedEntry[] = blocks.reduce<ParsedEntry[]>((acc, block) => {
    const titleMatch = block.match(/\\textbf\{([^}]+)\}/);
    if (!titleMatch) return acc;

    const dateMatch = block.match(/\\hfill\s*\\textit\{([^}]+)\}/);
    const subtitleMatch = block.match(/\\\\\n\s*\\textit\{\\color\{[^}]+\}([^}]+)\}/);
    const subtitleFallback = block.match(/\\\\\n\s*\\textit\{([^}]+)\}/);

    acc.push({
      title: titleMatch[1],
      date: dateMatch ? stripLatex(dateMatch[1]) : undefined,
      subtitle: subtitleMatch
        ? subtitleMatch[1]
        : subtitleFallback
          ? stripLatex(subtitleFallback[1])
          : undefined,
      bullets: extractItems(block),
    });
    return acc;
  }, []);

  return { title, entries };
}

function parseLatex(latex: string): ParsedCV {
  const name =
    latex.match(/\\Huge\\bfseries\s+([^\n\\{}]+)/)?.[1]?.trim() ?? 'Full Name';
  const email = latex.match(/href\{mailto:([^}]+)\}/)?.[1] ?? '';
  const linkedinMatch = latex.match(/linkedin\.com\/in\/([^}]+)/);
  const linkedin = linkedinMatch?.[1] ? `linkedin/in/${linkedinMatch[1]}` : '';
  const githubMatch = latex.match(/github\.com\/([^\}]+)\}/);
  const github = githubMatch?.[1] ? `github/${githubMatch[1]}` : '';
  const location = 'San Francisco, CA';

  // Split by \section{...}
  const parts = latex.split(/\\section\{([^}]+)\}/);
  const sections: ParsedSection[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    sections.push(parseSection(parts[i], parts[i + 1] ?? ''));
  }

  return { name, location, email, linkedin, github, sections };
}

// ─── Paper renderer ───────────────────────────────────────────────────────────

interface PdfTextClickInfo {
  word: string;
  before: string;
  after: string;
}

interface PDFPreviewProps {
  latexCode: string;
  isCompiling?: boolean;
  onTextDoubleClick?: (info: PdfTextClickInfo) => void;
}

export function PDFPreview({
  latexCode,
  isCompiling = false,
  onTextDoubleClick,
}: PDFPreviewProps) {
  const cv = useMemo(() => parseLatex(latexCode), [latexCode]);

  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const totalPages = 1;

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(200, z + 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, z - 10));
  }, []);

  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handleDoubleClick = useCallback(() => {
    if (!onTextDoubleClick || typeof window === 'undefined') return;

    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (!text) return;

    const range = selection.getRangeAt(0);
    const containerText = range.startContainer.textContent ?? '';
    const offset = range.startOffset;

    const before = containerText.slice(Math.max(0, offset - 30), offset);
    const after = containerText.slice(offset, offset + 30);

    onTextDoubleClick({
      word: text,
      before,
      after,
    });
  }, [onTextDoubleClick]);

  return (
    <div className="relative h-full w-full bg-[#020617] flex flex-col overflow-hidden">
      {/* Top chrome bar (mimics PDF viewer chrome) */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/60 shadow-[0_8px_30px_rgba(15,23,42,0.6)]">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-400/40">
            <FileText className="w-3.5 h-3.5 text-indigo-200" strokeWidth={1.6} />
          </div>
          <span className="text-[11px] uppercase tracking-[0.16em] text-slate-300 font-semibold">
            PDF Preview
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-200">
          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900/60 px-2 py-1 border border-slate-700/70 shadow-inner shadow-black/40">
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-100 border border-slate-600/70 transition-colors"
            >
              -
            </button>
            <span className="min-w-[38px] text-center text-[11px] font-medium text-slate-100">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-100 border border-slate-600/70 transition-colors"
            >
              +
            </button>
          </div>

          {/* Page navigation */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-900/60 px-2 py-1 border border-slate-700/70 shadow-inner shadow-black/40">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={page <= 1}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/70 transition-colors"
            >
              <ChevronLeft className="w-3 h-3 text-slate-100" />
            </button>
            <span className="min-w-[52px] text-center text-[11px] font-medium text-slate-100">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={page >= totalPages}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600/70 transition-colors"
            >
              <ChevronRight className="w-3 h-3 text-slate-100" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable paper area */}
      <div className="flex-1 overflow-y-auto py-4 px-4 flex justify-center items-start">
        <div
          className="relative bg-white shadow-[0_18px_60px_rgba(15,23,42,0.9)] rounded-md w-[720px] max-w-full min-h-[900px] mx-auto"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
        >
          {/* Compile overlay */}
          {isCompiling && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <span className="text-sm font-medium text-slate-500">
                Compiling LaTeX…
              </span>
            </div>
          )}

          <div
            className="px-8 py-8 text-[11px] leading-[1.5] text-[#111]"
            onDoubleClickCapture={handleDoubleClick}
          >

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="text-center mb-4 pb-4 border-b-2 border-[#1d4ed8]">
              <h1 className="text-[22px] font-black tracking-tight text-[#0f172a] mb-1.5">
                {cv.name}
              </h1>
              <div className="text-[10px] text-[#475569] flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                <span>{cv.location}</span>
                <span className="text-slate-300">·</span>
                <span className="text-[#1d4ed8]">{cv.email}</span>
                {cv.linkedin && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[#1d4ed8]">{cv.linkedin}</span>
                  </>
                )}
                {cv.github && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-[#1d4ed8]">{cv.github}</span>
                  </>
                )}
              </div>
            </div>

            {/* ── Sections ─────────────────────────────────────────────────── */}
            {cv.sections.map((section) => (
              <section key={section.title} className="mb-5">
                {/* Section heading */}
                <h2 className="text-[11px] font-black uppercase tracking-widest text-[#1d4ed8] border-b border-[#1d4ed8]/30 pb-0.5 mb-2">
                  {section.title}
                </h2>

                {/* Summary */}
                {section.summary && (
                  <p className="text-[10.5px] text-[#334155] leading-relaxed">
                    {section.summary}
                  </p>
                )}

                {/* Skill table */}
                {section.tableRows && (
                  <div className="grid grid-cols-1 gap-y-0.5">
                    {section.tableRows.map((row, i) => (
                      <div key={i} className="flex gap-2 text-[10px]">
                        <span className="font-bold text-[#0f172a] w-28 shrink-0">
                          {row[0]}
                        </span>
                        <span className="text-[#475569]">{row[1]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Experience / Education entries */}
                {section.entries.map((entry, i) => (
                  <div key={i} className={i > 0 ? 'mt-3' : ''}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-[11px] text-[#0f172a]">
                        {entry.title}
                      </span>
                      {entry.date && (
                        <span className="text-[9.5px] text-[#64748b] italic shrink-0 ml-2">
                          {entry.date}
                        </span>
                      )}
                    </div>
                    {entry.subtitle && (
                      <div className="text-[10px] text-[#475569] italic mb-1">
                        {entry.subtitle}
                      </div>
                    )}
                    {entry.bullets.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-3">
                        {entry.bullets.map((bullet, j) => (
                          <li
                            key={j}
                            className="text-[10px] text-[#334155] leading-snug flex gap-1.5"
                          >
                            <span className="mt-[3px] w-1 h-1 rounded-full bg-[#94a3b8] shrink-0" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
