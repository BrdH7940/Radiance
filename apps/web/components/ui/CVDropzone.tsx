'use client'

import { useCallback, useState } from 'react'
import { FileText, Upload, X, CheckCircle } from 'lucide-react'
import { useCVStore } from '@/store/useCVStore'

export function CVDropzone() {
    const { cvFile, setCvFile } = useCVStore()
    const [isDragging, setIsDragging] = useState(false)

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            setIsDragging(false)

            const file = e.dataTransfer.files?.[0]
            if (file && file.type === 'application/pdf') {
                setCvFile(file)
            }
        },
        [setCvFile]
    )

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            setIsDragging(false)
        },
        []
    )

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (file) setCvFile(file)
        },
        [setCvFile]
    )

    const handleRemove = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            setCvFile(null)
        },
        [setCvFile]
    )

    const hasFile = !!cvFile

    return (
        <div className="flex flex-col h-full">
            {/* Label row */}
            <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/30 flex items-center justify-center text-blue-500 font-black">
                    01
                </div>
                <div className="h-px flex-1 bg-white/5" />
                <span className="text-base font-medium text-slate-600">
                    PDF only
                </span>
            </div>

            <p className="text-xl font-black tracking-tight text-white mb-1">
                Your CV
            </p>
            <p className="text-base text-slate-500 mb-5">
                Drop your current resume to get started.
            </p>

            {/* Drop zone */}
            <label
                htmlFor="cv-file-input"
                className="cursor-pointer flex-1 block group"
            >
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`
            relative flex flex-col items-center justify-center
            rounded-[3rem] border-2 border-dashed h-full min-h-[320px]
            transition-all duration-700
            ${
                hasFile
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : isDragging
                      ? 'border-violet-400/60 bg-violet-500/5 scale-[1.01]'
                      : 'border-white/10 bg-white/[0.02] hover:border-blue-500/60 hover:bg-blue-500/5'
            }
          `}
                >
                    {hasFile ? (
                        /* File selected state */
                        <div className="flex flex-col items-center gap-4 p-8 text-center animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                                <CheckCircle
                                    className="w-8 h-8 text-blue-400"
                                    strokeWidth={1.5}
                                />
                            </div>

                            <div>
                                <p className="text-white font-bold text-base mb-0.5 truncate max-w-[220px]">
                                    {cvFile.name}
                                </p>
                                <p className="text-slate-500 text-sm">
                                    {(cvFile.size / 1024).toFixed(0)} KB · PDF
                                </p>
                            </div>

                            <button
                                onClick={handleRemove}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-slate-400 border border-white/10 hover:border-white/20 hover:text-slate-200 transition-all duration-300"
                            >
                                <X className="w-3 h-3" />
                                Remove
                            </button>
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="text-center group-hover:scale-105 transition-all duration-500">
                            <div className="w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-8 relative text-slate-400 group-hover:text-blue-400 transition-colors duration-300">
                                <Upload className="w-10 h-10 animate-bounce" />
                                <div className="absolute inset-0 rounded-full border border-blue-400/30 animate-ping" />
                            </div>
                            <h4 className="text-2xl font-black text-slate-200 group-hover:text-blue-200 mb-3 tracking-tight transition-colors duration-300">
                                Drop your PDF here
                            </h4>
                            <p className="text-slate-500 group-hover:text-blue-300 font-bold px-12 text-sm leading-relaxed transition-colors duration-300">
                                or click to browse files
                            </p>
                            <p className="mt-4 text-xs font-semibold text-slate-500 group-hover:text-blue-400 tracking-wide transition-colors duration-300">
                                PDF · Max 10 MB
                            </p>
                        </div>
                    )}
                </div>
            </label>

            <input
                id="cv-file-input"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="sr-only"
            />
        </div>
    )
}
