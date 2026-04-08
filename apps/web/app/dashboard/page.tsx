'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Sparkles,
    AlertCircle,
    ChevronLeft,
    RotateCcw,
} from 'lucide-react'
import { CVDropzone } from '@/components/ui/CVDropzone'
import { JDTextarea } from '@/components/ui/JDTextarea'
import { AnalyzingOverlay } from '@/components/ui/AnalyzingOverlay'
import { AnalysisDashboard } from '@/components/dashboard/AnalysisDashboard'
import { useCVStore } from '@/store/useCVStore'
import { uploadAndAnalyze } from '@/services/api'

const MIN_JD_LENGTH = 50

export default function EnhanceCVPage() {
    const router = useRouter()
    const {
        cvFile,
        jdText,
        phase,
        analysisResult,
        setPhase,
        setLoadingStepIndex,
        setJobId,
        setAnalysisResult,
        setCvData,
        setPdfUrl,
        reset,
    } = useCVStore()

    const [validationError, setValidationError] = useState<string | null>(null)

    const canAnalyze = !!cvFile && jdText.trim().length >= MIN_JD_LENGTH
    const isAnalyzing = phase === 'analyzing'

    const handleAnalyze = useCallback(async () => {
        if (!cvFile) {
            setValidationError('Please upload your CV (PDF) first.')
            return
        }
        if (jdText.trim().length < MIN_JD_LENGTH) {
            setValidationError(
                'Please paste a job description (at least 50 characters).'
            )
            return
        }

        setValidationError(null)
        setPhase('analyzing')

        const result = await uploadAndAnalyze(
            cvFile,
            jdText,
            (stepIndex) => setLoadingStepIndex(stepIndex)
        )

        if (result.status === 'completed' && result.result) {
            setJobId(result.jobId)
            setAnalysisResult(result.result)
            setPhase('dashboard')
        } else {
            setPhase('upload')
            setValidationError(
                result.error ?? 'Something went wrong. Please try again.'
            )
        }
    }, [
        cvFile,
        jdText,
        setPhase,
        setLoadingStepIndex,
        setJobId,
        setAnalysisResult,
    ])

    const handleEnhanceWithAI = () => {
        if (!analysisResult) return
        setCvData(analysisResult.enhanced_cv_json)
        setPdfUrl(analysisResult.pdf_url)
        setPhase('workspace')
        router.push('/workspace')
    }

    const handleNewAnalysis = () => {
        reset()
    }

    // ── Analyzing overlay ────────────────────────────────────────────────────
    if (isAnalyzing) {
        return <AnalyzingOverlay />
    }

    // ── Analysis results ─────────────────────────────────────────────────────
    if (phase === 'dashboard' && analysisResult) {
        return (
            <div className="px-6 sm:px-8 pt-8 pb-20">
                <div className="flex items-center justify-between mb-8">
                    <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 text-sm font-medium hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        New analysis
                    </button>

                    <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 text-sm font-medium hover:text-slate-300 hover:bg-white/5 transition-all duration-200"
                        title="Start over"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                    </button>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
                        Analysis complete
                    </h1>
                    <p className="text-slate-400 text-base mb-10">
                        Your CV has been analyzed against the job description. Review
                        the results below.
                    </p>

                    <AnalysisDashboard
                        result={analysisResult}
                        onEnhanceWithAI={handleEnhanceWithAI}
                    />
                </div>
            </div>
        )
    }

    // ── Upload form (default / upload phase) ─────────────────────────────────
    return (
        <div className="px-6 sm:px-8 pt-10 pb-20">
            {/* Hero header */}
            <div className="mb-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 mb-5">
                    <span className="text-sm font-medium text-blue-400 tracking-wider">
                        Powered by Gemini
                    </span>
                </div>

                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-white mb-3 leading-[1.05]">
                    Close the Gap,{' '}
                    <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                        Land the Role.
                    </span>
                </h1>

                <p className="text-slate-400 text-base max-w-xl leading-relaxed">
                    Upload your CV and the JD.{' '}
                    <strong className="text-slate-300">Radiance</strong> analyzes the
                    gap and enhances the CV to be more attractive.
                </p>
            </div>

            {/* Validation error */}
            {validationError && (
                <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 max-w-2xl animate-in fade-in duration-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-400">{validationError}</p>
                </div>
            )}

            {/* Split-screen input */}
            <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700"
                style={{ animationDelay: '150ms' }}
            >
                <div className="min-h-[460px]">
                    <CVDropzone />
                </div>
                <div className="min-h-[460px]">
                    <JDTextarea />
                </div>
            </div>

            {/* CTA */}
            <div
                className="flex justify-center animate-in fade-in slide-in-from-bottom-8 duration-700"
                style={{ animationDelay: '300ms' }}
            >
                <button
                    type="button"
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
                    {canAnalyze && !isAnalyzing && (
                        <span className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    )}
                    <Sparkles className="w-5 h-5 relative z-10" strokeWidth={2} />
                    <span className="relative z-10">Analyze &amp; Enhance CV</span>
                </button>
            </div>

            {!canAnalyze && (
                <p className="text-center text-slate-700 text-xs mt-4 animate-in fade-in duration-500">
                    {!cvFile && !jdText.trim()
                        ? 'Upload your CV and paste a JD (50+ characters) to continue.'
                        : !cvFile
                          ? 'Upload your CV (PDF) to continue.'
                          : 'Paste a job description (at least 50 characters) to continue.'}
                </p>
            )}
        </div>
    )
}
