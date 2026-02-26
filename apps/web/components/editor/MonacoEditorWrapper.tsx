'use client'

import { useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { OnMount, OnChange } from '@monaco-editor/react'

// ─── Dynamic import — Monaco is browser-only ─────────────────────────────────

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => <EditorSkeleton />,
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectionInfo {
    selectedText: string
    /** Viewport-relative pixel position (for FloatingAIMenu placement). */
    screenPosition: { top: number; left: number }
    /** Stored Monaco selection range so we can apply edits later. */
    monacoSelection: {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
    }
}

interface MonacoEditorWrapperProps {
    value: string
    onChange: (value: string) => void
    onSelectionChange: (info: SelectionInfo | null) => void
    onEditorMount?: (editor: unknown) => void
}

// ─── LaTeX Monarch tokenizer ──────────────────────────────────────────────────

const LATEX_TOKENS = {
    defaultToken: '',
    tokenizer: {
        root: [
            [/%.*$/, 'comment'],
            [/\\(begin|end)\{[^}]*\}/, 'keyword.control'],
            [/\\[a-zA-Z@]+\*?/, 'keyword'],
            [/\$\$[\s\S]*?\$\$/, 'string.math'],
            [/\$[^$\n]*\$/, 'string.math'],
            [/[{}]/, 'delimiter.bracket'],
            [/[\[\]]/, 'delimiter.square'],
            [/[&~^_]/, 'keyword.operator'],
            [/[0-9]+(\.[0-9]+)?/, 'number'],
            [/[·]/, 'comment'],
        ],
    },
}

// ─── Custom dark theme ────────────────────────────────────────────────────────

const RADIANCE_THEME = {
    base: 'vs-dark' as const,
    inherit: true,
    rules: [
        { token: 'comment', foreground: '374151', fontStyle: 'italic' },
        { token: 'keyword.control', foreground: 'A78BFA' },
        { token: 'keyword', foreground: '818CF8' },
        { token: 'keyword.operator', foreground: 'F59E0B' },
        { token: 'string.math', foreground: '34D399' },
        { token: 'delimiter.bracket', foreground: '64748B' },
        { token: 'delimiter.square', foreground: '64748B' },
        { token: 'number', foreground: 'FB923C' },
        { token: '', foreground: 'CBD5E1' },
    ],
    colors: {
        'editor.background': '#05070a',
        'editor.foreground': '#CBD5E1',
        'editor.lineHighlightBackground': '#ffffff06',
        'editor.selectionBackground': '#3B82F640',
        'editor.inactiveSelectionBackground': '#3B82F620',
        'editorLineNumber.foreground': '#1E293B',
        'editorLineNumber.activeForeground': '#475569',
        'editorCursor.foreground': '#818CF8',
        'editorGutter.background': '#05070a',
        'editorWidget.background': '#0f172a',
        'editorWidget.border': '#1e293b',
        'editorSuggestWidget.background': '#0f172a',
        'editorSuggestWidget.border': '#1e293b',
        'editorIndentGuide.background1': '#1e293b40',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#e5e7eb66',
        'scrollbarSlider.hoverBackground': '#e5e7eb99',
        'scrollbarSlider.activeBackground': '#f9fafbcc',
        'minimap.background': '#05070a',
    },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonacoEditorWrapper({
    value,
    onChange,
    onSelectionChange,
    onEditorMount,
}: MonacoEditorWrapperProps) {
    const editorRef = useRef<unknown>(null)
    const disposablesRef = useRef<Array<{ dispose(): void }>>([])

    // Cleanup all Monaco disposables on unmount
    useEffect(() => {
        return () => {
            disposablesRef.current.forEach((d) => d.dispose())
            disposablesRef.current = []
        }
    }, [])

    const handleMount: OnMount = useCallback(
        (editor, monaco) => {
            editorRef.current = editor
            onEditorMount?.(editor)

            // Register LaTeX language
            monaco.languages.register({ id: 'latex' })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            monaco.languages.setMonarchTokensProvider(
                'latex',
                LATEX_TOKENS as any
            )

            // Apply custom theme
            monaco.editor.defineTheme('radiance-dark', RADIANCE_THEME)
            monaco.editor.setTheme('radiance-dark')

            // ── Selection tracking ──────────────────────────────────────────────

            const selectionDisposable = editor.onDidChangeCursorSelection(
                () => {
                    const selection = editor.getSelection()

                    if (!selection || selection.isEmpty()) {
                        onSelectionChange(null)
                        return
                    }

                    const selectedText =
                        editor.getModel()?.getValueInRange(selection) ?? ''
                    if (!selectedText.trim()) {
                        onSelectionChange(null)
                        return
                    }

                    // Compute the on-screen pixel position of the selection end
                    const endPos = selection.getEndPosition()
                    const pixelPos = editor.getScrolledVisiblePosition(endPos)
                    const domNode = editor.getDomNode()

                    if (!pixelPos || !domNode) {
                        onSelectionChange(null)
                        return
                    }

                    const rect = domNode.getBoundingClientRect()

                    onSelectionChange({
                        selectedText,
                        screenPosition: {
                            top: rect.top + pixelPos.top,
                            left: rect.left + pixelPos.left,
                        },
                        monacoSelection: {
                            startLineNumber: selection.startLineNumber,
                            startColumn: selection.startColumn,
                            endLineNumber: selection.endLineNumber,
                            endColumn: selection.endColumn,
                        },
                    })
                }
            )

            // Close floating menu when editor scrolls
            const scrollDisposable = editor.onDidScrollChange(() => {
                onSelectionChange(null)
            })

            disposablesRef.current.push(selectionDisposable, scrollDisposable)
        },
        [onEditorMount, onSelectionChange]
    )

    const handleChange: OnChange = useCallback(
        (val) => onChange(val ?? ''),
        [onChange]
    )

    return (
        <div className="h-full w-full">
            <MonacoEditor
                height="100%"
                defaultLanguage="latex"
                value={value}
                onChange={handleChange}
                onMount={handleMount}
                options={{
                    fontSize: 13,
                    fontFamily:
                        '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                    fontLigatures: true,
                    lineHeight: 22,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    padding: { top: 20, bottom: 20 },
                    smoothScrolling: true,
                    cursorSmoothCaretAnimation: 'on',
                    renderLineHighlight: 'all',
                    scrollbar: {
                        verticalScrollbarSize: 4,
                        horizontalScrollbarSize: 4,
                        useShadows: false,
                    },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    glyphMargin: false,
                    folding: true,
                    lineDecorationsWidth: 4,
                    lineNumbersMinChars: 3,
                    renderWhitespace: 'none',
                    contextmenu: true,
                    quickSuggestions: false,
                    parameterHints: { enabled: false },
                    suggestOnTriggerCharacters: false,
                    acceptSuggestionOnEnter: 'off',
                    tabCompletion: 'off',
                    wordBasedSuggestions: 'off',
                }}
            />
        </div>
    )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function EditorSkeleton() {
    return (
        <div className="h-full w-full bg-[#05070a] flex flex-col gap-3 p-6 overflow-hidden">
            {/* Line number + code skeleton rows */}
            {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <div
                        className="w-5 h-3 rounded bg-white/5 shrink-0"
                        style={{ opacity: 0.3 + (i % 3) * 0.15 }}
                    />
                    <div
                        className="h-3 rounded bg-white/5"
                        style={{
                            width: `${20 + ((i * 37 + 13) % 60)}%`,
                            opacity: 0.15 + (i % 4) * 0.05,
                        }}
                    />
                </div>
            ))}
        </div>
    )
}
