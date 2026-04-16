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
    /** Viewport-relative pixel position for any selection-aware UI. */
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

// ─── Custom neobrutalist theme ────────────────────────────────────────────────

const RADIANCE_THEME = {
    base: 'vs' as const,
    inherit: true,
    rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword.control', foreground: '432DD7' },
        { token: 'keyword', foreground: '1C293C' },
        { token: 'keyword.operator', foreground: 'DC2626' },
        { token: 'string.math', foreground: '16A34A' },
        { token: 'delimiter.bracket', foreground: '1C293C' },
        { token: 'delimiter.square', foreground: '1C293C' },
        { token: 'number', foreground: 'B45309' },
        { token: '', foreground: '1C293C' },
    ],
    colors: {
        'editor.background': '#FBFBF9',
        'editor.foreground': '#1C293C',
        'editor.lineHighlightBackground': '#FDC80022',
        'editor.selectionBackground': '#432DD733',
        'editor.inactiveSelectionBackground': '#432DD71A',
        'editorLineNumber.foreground': '#6B7280',
        'editorLineNumber.activeForeground': '#1C293C',
        'editorCursor.foreground': '#1C293C',
        'editorGutter.background': '#FBFBF9',
        'editorWidget.background': '#FBFBF9',
        'editorWidget.border': '#000000',
        'editorSuggestWidget.background': '#FBFBF9',
        'editorSuggestWidget.border': '#000000',
        'editorIndentGuide.background1': '#00000020',
        'scrollbar.shadow': '#00000000',
        'scrollbarSlider.background': '#00000066',
        'scrollbarSlider.hoverBackground': '#00000099',
        'scrollbarSlider.activeBackground': '#000000cc',
        'minimap.background': '#FBFBF9',
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
            monaco.languages.setMonarchTokensProvider(
                'latex',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        <div className="h-full w-full border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
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
        <div className="h-full w-full bg-[#FBFBF9] flex flex-col gap-3 p-6 overflow-hidden border-4 border-black">
            {/* Line number + code skeleton rows */}
            {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <div
                        className="w-5 h-3 bg-black/10 shrink-0"
                        style={{ opacity: 0.3 + (i % 3) * 0.15 }}
                    />
                    <div
                        className="h-3 bg-black/10"
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
