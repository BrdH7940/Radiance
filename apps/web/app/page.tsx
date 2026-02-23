'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, AlertCircle } from 'lucide-react'
import { NavBar } from '@/components/ui/NavBar'
import { CVDropzone } from '@/components/ui/CVDropzone'
import { JDTextarea } from '@/components/ui/JDTextarea'
import { AnalyzingOverlay } from '@/components/ui/AnalyzingOverlay'
import { useCVStore } from '@/store/useCVStore'
import { uploadAndAnalyze } from '@/services/api'

export default function UploadPage() {
    const router = useRouter()
    const {
        cvFile,
        jdText,
        phase,
        setPhase,
        setLoadingStepIndex,
        setLatexCode,
        setPdfUrl,
    } = useCVStore()

    const [validationError, setValidationError] = useState<string | null>(null)

    const canAnalyze = !!cvFile && jdText.trim().length > 10

    const handleAnalyze = useCallback(async () => {
        if (!cvFile) {
            setValidationError('Please upload your CV (PDF) first.')
            return
        }
        if (jdText.trim().length < 10) {
            setValidationError(
                'Please paste a job description (at least a few words).'
            )
            return
        }

        setValidationError(null)
        setPhase('analyzing')

        try {
            const result = await uploadAndAnalyze(
                cvFile,
                jdText,
                (stepIndex) => {
                    setLoadingStepIndex(stepIndex)
                }
            )

            setLatexCode(result.latexCode)
            setPdfUrl(result.pdfUrl)
            setPhase('workspace')
            router.push('/workspace')
        } catch {
            setPhase('upload')
            setValidationError('Something went wrong. Please try again.')
        }
    }, [
        cvFile,
        jdText,
        router,
        setLatexCode,
        setLoadingStepIndex,
        setPhase,
        setPdfUrl,
    ])

    const isAnalyzing = phase === 'analyzing'

    return (
        <>
            {isAnalyzing && <AnalyzingOverlay />}

            <div className="min-h-screen bg-midnight overflow-x-hidden overflow-y-auto">
                {/* Background elements */}
                <div className="glow-blob w-[600px] h-[600px] -top-32 -left-32 bg-blue-700/15" />
                <div className="glow-blob w-[500px] h-[500px] top-1/2 -right-40 bg-violet-700/12" />

                {/* Blueprint grid */}
                <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />

                <NavBar activeStep={1} />

                <main className="relative z-10 max-w-screen-xl mx-auto px-8 pt-12 pb-20">
                    {/* Hero header */}
                    <div className="mb-14 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 mb-6">
                            <span className="text-sm font-medium text-blue-400 tracking-wider">
                                Powered by Gemini
                            </span>
                        </div>

                        <h1 className="text-5xl sm:text-6xl font-black tracking-tighter text-white mb-4 leading-[1.05]">
                            Close the Gap,{' '}
                            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                                Land the Role.
                            </span>
                        </h1>

                        <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
                            Upload your CV and the JD. <strong>Radiance</strong>{' '}
                            analyzes the gap and enhances the CV to be more
                            attractive.
                        </p>
                    </div>

                    {/* Validation error */}
                    {validationError && (
                        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 max-w-2xl mx-auto animate-in fade-in duration-300">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <p className="text-sm text-amber-400">
                                {validationError}
                            </p>
                        </div>
                    )}

                    {/* Split-screen input */}
                    <div
                        className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700"
                        style={{ animationDelay: '150ms' }}
                    >
                        {/* Left — CV Upload */}
                        <div className="min-h-[480px]">
                            <CVDropzone />
                        </div>

                        {/* Divider (visible on desktop) */}
                        <div className="hidden lg:block absolute left-1/2 top-1/3 bottom-1/3 w-px bg-white/5 -translate-x-1/2" />

                        {/* Right — JD Input */}
                        <div className="min-h-[480px]">
                            <JDTextarea />
                        </div>
                    </div>

                    {/* CTA Button */}
                    <div
                        className="flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-700"
                        style={{ animationDelay: '300ms' }}
                    >
                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className={`
                group relative flex items-center gap-3 px-10 py-4 rounded-[2rem]
                font-bold text-base tracking-wide transition-all duration-500
                ${
                    canAnalyze && !isAnalyzing
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-xl shadow-blue-900/40 hover:shadow-blue-800/50 hover:scale-[1.03] hover:brightness-110 cursor-pointer'
                        : 'bg-white/5 text-slate-600 border border-white/8 cursor-not-allowed'
                }
              `}
                        >
                            {/* Shine overlay */}
                            {canAnalyze && !isAnalyzing && (
                                <span className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            )}

                            <Sparkles
                                className="w-5 h-5 relative z-10"
                                strokeWidth={2}
                            />
                            <span className="relative z-10">
                                Analyze &amp; Enhance CV
                            </span>
                        </button>
                    </div>

                    {/* Helper text */}
                    {!canAnalyze && (
                        <p className="text-center text-slate-700 text-xs mt-4 animate-in fade-in duration-500">
                            {!cvFile && !jdText.trim()
                                ? 'Upload your CV and paste a JD to continue.'
                                : !cvFile
                                  ? 'Upload your CV (PDF) to continue.'
                                  : 'Paste a job description to continue.'}
                        </p>
                    )}
                </main>
            </div>
        </>
    )
}
