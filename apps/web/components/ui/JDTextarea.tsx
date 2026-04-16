'use client'

import { useMemo } from 'react'
import type React from 'react'
import { FileSearch } from 'lucide-react'
import { useCVStore } from '@/store/useCVStore'

// Set to true, paste content, then check browser console (F12) and share the output
const DEBUG_PASTE = false

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

        if (DEBUG_PASTE) {
            const plainText = e.clipboardData.getData('text/plain')
            console.log('[JDTextarea DEBUG] === Clipboard structure ===')
            console.log(
                '[JDTextarea DEBUG] Raw HTML (first 2000 chars):',
                html.slice(0, 2000)
            )
            console.log('[JDTextarea DEBUG] Plain text:', plainText)
            console.log(
                '[JDTextarea DEBUG] Blocks found:',
                blocks.map((el, i) => ({
                    i,
                    tag: el.tagName,
                    text:
                        el.textContent?.slice(0, 80) +
                        (el.textContent && el.textContent.length > 80
                            ? '...'
                            : ''),
                }))
            )
        }

        // If there is no recognizable structure, fall back to default paste behavior.
        if (blocks.length === 0) return

        e.preventDefault()

        const lines: string[] = []
        const lastTags: string[] = [] // Track tag of each line for merge logic

        for (const el of blocks) {
            // Normalize: replace newlines within block with space (source apps embed line-wrap newlines)
            const text = el.textContent?.trim().replace(/\s*\n\s*/g, ' ').trim()
            if (!text) continue

            if (el.tagName === 'LI') {
                lines.push(`• ${text}`)
                lastTags.push('LI')
            } else {
                // Merge consecutive <p> blocks that are part of the same logical paragraph.
                // Word/Google Docs often split wrapped lines into separate <p> tags.
                const prevWasP = lastTags[lastTags.length - 1] === 'P'
                const isContinuation =
                    el.tagName === 'P' &&
                    prevWasP &&
                    lines.length > 0 &&
                    /[,\;:]\s*$/.test(lines[lines.length - 1])

                if (isContinuation) {
                    lines[lines.length - 1] += ' ' + text
                } else {
                    lines.push((lines.length > 0 ? '\n' : '') + text)
                    lastTags.push(el.tagName)
                }
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
                <div className="w-10 h-10 rounded-none bg-[#FDC800] border-4 border-black flex items-center justify-center text-[#1C293C] font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    02
                </div>
                <div className="h-px flex-1 bg-black/20" />
                <span className="text-base font-medium text-[#4B5563]">
                    Plain text
                </span>
            </div>

            <p className="text-xl font-black tracking-tight text-[#1C293C] mb-1">
                Job Description
            </p>
            <p className="text-base text-[#4B5563] mb-5">
                Paste the full JD so AI can identify the skill gaps.
            </p>

            {/* Textarea container */}
            <div className="flex-1 flex flex-col min-h-[320px] rounded-none border-4 border-black bg-[#FBFBF9] overflow-hidden transition-all duration-500 focus-within:border-black focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]">
                {/* Header bar */}
                <div className="flex items-center gap-2 px-5 py-3 border-b-4 border-black">
                    <FileSearch
                        className="w-4 h-4 text-[#1C293C]"
                        strokeWidth={1.5}
                    />
                    <span className="text-sm font-medium text-[#4B5563] tracking-wide">
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
            flex-1 w-full px-5 py-4 bg-transparent text-[#1C293C] text-base
            leading-relaxed resize-none outline-none
            placeholder:text-[#4B5563]
            scrollbar-thin jd-scrollbar
          "
                    spellCheck={false}
                />

                {/* Footer counter */}
                <div className="flex items-center justify-between px-5 py-2.5 border-t-4 border-black bg-[#FBFBF9]">
                    <span className="text-sm text-[#4B5563]">
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

                    <span className="text-sm text-[#4B5563] tabular-nums">
                        {charCount.toLocaleString()} chars
                    </span>
                </div>
            </div>
        </div>
    )
}
