'use client'

import { useCallback, useState } from 'react'
import { Upload, X, CheckCircle } from 'lucide-react'
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
                <div className="w-10 h-10 rounded-none bg-[#FDC800] border-4 border-black flex items-center justify-center text-[#1C293C] font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    01
                </div>
                <div className="h-px flex-1 bg-black/20" />
                <span className="text-base font-medium text-[#4B5563]">
                    PDF only
                </span>
            </div>

            <p className="text-xl font-black tracking-tight text-[#1C293C] mb-1">
                Your CV
            </p>
            <p className="text-base text-[#4B5563] mb-5">
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
            rounded-none border-4 border-dashed h-full min-h-[320px]
            transition-all duration-700
            ${
                hasFile
                    ? 'border-black bg-[#FDC800]'
                    : isDragging
                      ? 'border-black bg-[#FBFBF9] scale-[1.01]'
                      : 'border-black bg-[#FBFBF9] hover:border-black hover:bg-[#FBFBF9]'
            }
          `}
                >
                    {hasFile ? (
                        /* File selected state */
                        <div className="flex flex-col items-center gap-4 p-8 text-center animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-none bg-[#FDC800] border-4 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <CheckCircle
                                    className="w-8 h-8 text-[#1C293C]"
                                    strokeWidth={1.5}
                                />
                            </div>

                            <div>
                                <p className="text-[#1C293C] font-bold text-base mb-0.5 truncate max-w-[220px]">
                                    {cvFile.name}
                                </p>
                                <p className="text-[#4B5563] text-sm">
                                    {(cvFile.size / 1024).toFixed(0)} KB · PDF
                                </p>
                            </div>

                            <button
                                onClick={handleRemove}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#1C293C] border-4 border-black bg-[#FBFBF9] hover:bg-[#DC2626]/10 hover:text-[#DC2626] hover:border-black transition-all duration-300 hover:translate-x-[2px] hover:translate-y-[2px]"
                            >
                                <X className="w-3 h-3" />
                                Remove
                            </button>
                        </div>
                    ) : (
                        /* Empty state */
                        <div className="text-center group-hover:scale-105 transition-all duration-500">
                            <div className="w-24 h-24 rounded-none bg-[#FBFBF9] border-4 border-black flex items-center justify-center mx-auto mb-8 relative text-[#1C293C] group-hover:text-[#432DD7] transition-colors duration-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                <Upload className="w-10 h-10 animate-bounce" />
                                <div className="absolute inset-0 rounded-none border border-black/30 animate-ping" />
                            </div>
                            <h4 className="text-2xl font-black text-[#1C293C] group-hover:text-[#432DD7] mb-3 tracking-tight transition-colors duration-300">
                                Drop your PDF here
                            </h4>
                            <p className="text-[#4B5563] group-hover:text-[#432DD7] font-bold px-12 text-sm leading-relaxed transition-colors duration-300">
                                or click to browse files
                            </p>
                            <p className="mt-4 text-xs font-semibold text-[#4B5563] group-hover:text-[#432DD7] tracking-wide transition-colors duration-300">
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
