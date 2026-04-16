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
        inputReviewMode,
        analysisResult,
        setPhase,
        setInputReviewMode,
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
        setInputReviewMode(false)
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
                        className="flex items-center gap-1.5 px-3 py-2 rounded-none border-4 border-black bg-[#FBFBF9] text-[#1C293C] text-sm font-medium shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all duration-200"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        New analysis
                    </button>

                    <button
                        type="button"
                        onClick={handleNewAnalysis}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-none border-4 border-black bg-[#FBFBF9] text-[#1C293C] text-sm font-medium shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all duration-200"
                        title="Start over"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                    </button>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1C293C] mb-2">
                        Analysis complete
                    </h1>
                    <p className="text-[#4B5563] text-base mb-10">
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
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-none border-4 border-black bg-black text-white mb-5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                    <span className="text-sm font-medium text-white tracking-wider">
                        Powered by Gemini
                    </span>
                </div>

                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-[#1C293C] mb-3 leading-[1.05]">
                    Close the Gap,{' '}
                    <span className="bg-[#FDC800] px-4 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                        Land the Role.
                    </span>
                </h1>

                <p className="text-[#4B5563] text-base max-w-xl leading-relaxed">
                    Upload your CV and the JD.{' '}
                    <strong className="text-[#1C293C]">Radiance</strong> analyzes the
                    gap and enhances the CV to be more attractive.
                </p>
            </div>

            {/* Validation error */}
            {validationError && (
                <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-none border-4 border-black bg-[#FBFBF9] max-w-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in duration-300">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-400">{validationError}</p>
                </div>
            )}

            {/* Split-screen input */}
            <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 animate-in fade-in slide-in-from-bottom-8 duration-700"
                style={{ animationDelay: '150ms' }}
            >
                <div className="min-h-[460px] border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6">
                    <CVDropzone reviewMode={inputReviewMode} />
                </div>
                <div className="min-h-[460px] border-4 border-black bg-[#FBFBF9] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6">
                    <JDTextarea readOnly={inputReviewMode} />
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
                                ? 'border-4 border-black bg-[#FDC800] text-[#1C293C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer'
                                : 'bg-[#FBFBF9] text-[#4B5563] border-4 border-black cursor-not-allowed opacity-60'
                        }
                    `}
                >
                    {canAnalyze && !isAnalyzing && (
                        <span className="absolute inset-0 rounded-none bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    )}
                    <Sparkles className="w-5 h-5 relative z-10" strokeWidth={2} />
                    <span className="relative z-10">Analyze &amp; Enhance CV</span>
                </button>
            </div>

            {!canAnalyze && (
                <p className="text-center text-[#4B5563] text-xs mt-4 animate-in fade-in duration-500">
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
