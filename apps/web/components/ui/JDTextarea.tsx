'use client'

import { useMemo } from 'react'
import type React from 'react'
import { FileSearch } from 'lucide-react'
import { useCVStore } from '@/store/useCVStore'

const PLACEHOLDER = `Paste the full job description here…

Example:
We are looking for a Senior Software Engineer to join our platform team. You will design and build scalable microservices, mentor junior engineers, and collaborate cross-functionally.

Requirements:
• 5+ years of experience with Python or Go
• Experience with distributed systems and Kafka
• Strong communication and leadership skills
• AWS or GCP cloud experience`

export function JDTextarea() {
    const { jdText, setJdText } = useCVStore()

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const html = e.clipboardData.getData('text/html')

        // If there is no HTML (plain-text copy), let the browser handle it.
        if (!html) return

        const doc = new DOMParser().parseFromString(html, 'text/html')
        const blocks = Array.from(
            doc.body.querySelectorAll<HTMLElement>(
                'li, p, h1, h2, h3, h4, h5, h6'
            )
        )

        // If there is no recognizable structure, fall back to default paste behavior.
        if (blocks.length === 0) return

        e.preventDefault()

        const lines: string[] = []

        for (const el of blocks) {
            const text = el.textContent?.trim()
            if (!text) continue

            if (el.tagName === 'LI') {
                lines.push(`• ${text}`)
            } else {
                lines.push('\n' + text)
            }
        }

        const textToInsert = lines.join('\n')?.trim()

        const target = e.target as HTMLTextAreaElement
        const { selectionStart, selectionEnd, value } = target

        const newValue =
            value.slice(0, selectionStart) +
            textToInsert +
            value.slice(selectionEnd)

        setJdText(newValue)

        const cursorPos = selectionStart + textToInsert.length

        requestAnimationFrame(() => {
            target.selectionStart = cursorPos
            target.selectionEnd = cursorPos
        })
    }

    const wordCount = useMemo(() => {
        if (!jdText.trim()) return 0
        return jdText.trim().split(/\s+/).length
    }, [jdText])

    const charCount = jdText.length

    return (
        <div className="flex flex-col h-full">
            {/* Label row */}
            <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-600/30 flex items-center justify-center text-violet-500 font-black">
                    02
                </div>
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-base font-medium text-slate-600">
                    Plain text
                </span>
            </div>

            <p className="text-xl font-black tracking-tight text-white mb-1">
                Job Description
            </p>
            <p className="text-base text-slate-500 mb-5">
                Paste the full JD so AI can identify the skill gaps.
            </p>

            {/* Textarea container */}
            <div className="flex-1 flex flex-col min-h-[320px] rounded-[2.5rem] border border-white/10 bg-[#0a0f18] overflow-hidden transition-all duration-500 focus-within:border-indigo-500/40 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.15)]">
                {/* Header bar */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                    <FileSearch
                        className="w-4 h-4 text-slate-500"
                        strokeWidth={1.5}
                    />
                    <span className="text-sm font-medium text-slate-500 tracking-wide">
                        job_description.txt
                    </span>
                </div>

                {/* Text area */}
                <textarea
                    value={jdText}
                    onPaste={handlePaste}
                    onChange={(e) => setJdText(e.target.value)}
                    placeholder={PLACEHOLDER}
                    className="
            flex-1 w-full px-5 py-4 bg-transparent text-slate-300 text-base
            leading-relaxed resize-none outline-none
            placeholder:text-slate-700
            scrollbar-thin jd-scrollbar
          "
                    spellCheck={false}
                />

                {/* Footer counter */}
                <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/5 bg-white/[0.015]">
                    <span className="text-sm text-slate-600">
                        {charCount > 0 ? (
                            <>
                                <span
                                    className={`font-medium ${wordCount > 50 ? 'text-emerald-500' : 'text-amber-500'}`}
                                >
                                    {wordCount}
                                </span>{' '}
                                words
                            </>
                        ) : (
                            'Empty'
                        )}
                    </span>

                    {wordCount > 0 && wordCount < 50 && (
                        <span className="text-sm text-amber-500/80">
                            More detail = Better analysis
                        </span>
                    )}

                    <span className="text-sm text-slate-700 tabular-nums">
                        {charCount.toLocaleString()} chars
                    </span>
                </div>
            </div>
        </div>
    )
}
