'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertCircle,
    BookMarked,
    ChevronLeft,
    Loader2,
    RotateCcw,
    Sparkles,
    Zap,
} from 'lucide-react'
import { CVDropzone } from '@/components/ui/CVDropzone'
import { JDTextarea } from '@/components/ui/JDTextarea'
import { AnalyzingOverlay } from '@/components/ui/AnalyzingOverlay'
import { AnalysisDashboard } from '@/components/dashboard/AnalysisDashboard'
import { ProjectSelectionHub } from '@/components/dashboard/ProjectSelectionHub'
import { useCVStore } from '@/store/useCVStore'
import { uploadAndAnalyze, AnalysisService } from '@/services/api'
import type { ProjectItem } from '@/services/api'
import { getProjects } from '@/services/projectApi'
import { analyzeProjectsWithClientAI, type OnProgressCallback } from '@/services/aiClientService'

const MIN_JD_LENGTH = 50

const GALLERY_STEP_LABELS: Record<0 | 1 | 2, string> = {
    0: 'Starting AI analysis…',
    1: 'Step 1/2: Ranking Projects…',
    2: 'Step 2/2: Generating AI Reasoning…',
}

export default function EnhanceCVPage() {
    const router = useRouter()
    const {
        cvFile,
        jdText,
        phase,
        inputReviewMode,
        analysisResult,
        authHydrated,
        galleryPhase,
        galleryLoadingStep,
        projectGallery,
        setPhase,
        setInputReviewMode,
        setLoadingStepIndex,
        setJobId,
        setAnalysisResult,
        setCvData,
        setPdfUrl,
        reset,
        startGalleryAnalysis,
        consultGallery,
        setGalleryError,
        setProjectGallery,
        setGalleryLoadingStep,
    } = useCVStore()

    const [validationError, setValidationError] = useState<string | null>(null)
    const [galleryJobId, setGalleryJobId] = useState<string | null>(null)
    // Prevents the gallery fetch from running twice in React Strict Mode.
    const galleryFetchedRef = useRef(false)

    const canAnalyze = !!cvFile && jdText.trim().length >= MIN_JD_LENGTH
    const isAnalyzing = phase === 'analyzing'
    const isGalleryAnalyzing = galleryPhase === 'ANALYZING'

    // ── Load project gallery — ONLY after auth is fully settled ──────────────
    // Gating on `authHydrated` serialises this fetch AFTER SupabaseAuthListener
    // has finished getUser() + onAuthStateChange setup. Without this gate,
    // getProjects() → getSession() runs concurrently with the auth lock held by
    // the listener, causing the NavigatorLock timeout / stolen-lock error.
    // The ref guard prevents the double-invocation from React Strict Mode (dev).
    useEffect(() => {
        if (!authHydrated) return
        if (galleryFetchedRef.current || projectGallery.length > 0) return
        galleryFetchedRef.current = true

        getProjects()
            .then((projects) => {
                const items: ProjectItem[] = projects.map((p) => ({
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    tech_stack: p.technologies,
                }))
                setProjectGallery(items)
            })
            .catch(() => {
                // Non-fatal: gallery is optional for the legacy flow.
                // Reset flag so the user can retry on next navigation.
                galleryFetchedRef.current = false
            })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authHydrated])

    // ── Poll for gallery job completion ────────────────────────────────────────
    useEffect(() => {
        if (!galleryJobId || galleryPhase !== 'FINALIZING') return

        const intervalId = setInterval(async () => {
            try {
                const statusResponse = await AnalysisService.pollJobStatus(galleryJobId)
                if (statusResponse.status === 'completed' && statusResponse.result) {
                    clearInterval(intervalId)
                    setCvData(statusResponse.result.enhanced_cv_json)
                    setPdfUrl(statusResponse.result.pdf_url)
                    setPhase('workspace')
                    router.push('/workspace')
                } else if (statusResponse.status === 'failed') {
                    clearInterval(intervalId)
                    setGalleryError(statusResponse.error ?? 'Gallery enhancement failed.')
                }
            } catch {
                clearInterval(intervalId)
                setGalleryError('Failed to poll gallery job status.')
            }
        }, 2000)

        return () => clearInterval(intervalId)
    }, [galleryJobId, galleryPhase, setCvData, setPdfUrl, setPhase, setGalleryError, router])

    // ── Legacy analysis handler ────────────────────────────────────────────────
    const handleAnalyze = useCallback(async () => {
        if (!cvFile) {
            setValidationError('Please upload your CV (PDF) first.')
            return
        }
        if (jdText.trim().length < MIN_JD_LENGTH) {
            setValidationError('Please paste a job description (at least 50 characters).')
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
            setValidationError(result.error ?? 'Something went wrong. Please try again.')
        }
    }, [
        cvFile,
        jdText,
        setPhase,
        setInputReviewMode,
        setLoadingStepIndex,
        setJobId,
        setAnalysisResult,
    ])

    // ── Legacy quick enhance ───────────────────────────────────────────────────
    const handleEnhanceWithAI = () => {
        if (!analysisResult) return
        setCvData(analysisResult.enhanced_cv_json)
        setPdfUrl(analysisResult.pdf_url)
        setPhase('workspace')
        router.push('/workspace')
    }

    // ── Strategic gallery analyze handler ─────────────────────────────────────
    const handleStrategicAnalyze = useCallback(async () => {
        if (jdText.trim().length < MIN_JD_LENGTH) {
            setValidationError('Please paste a job description (at least 50 characters).')
            return
        }
        setValidationError(null)
        startGalleryAnalysis()

        const onProgress: OnProgressCallback = (step) => {
            setGalleryLoadingStep(step)
        }

        try {
            const results = await analyzeProjectsWithClientAI(jdText, projectGallery, onProgress)
            consultGallery(results)
        } catch (err) {
            setGalleryError(
                err instanceof Error ? err.message : 'AI analysis failed. Please try again.'
            )
        }
    }, [
        jdText,
        projectGallery,
        startGalleryAnalysis,
        consultGallery,
        setGalleryError,
        setGalleryLoadingStep,
    ])

    const handleNewAnalysis = () => {
        reset()
    }

    // ── Analyzing overlay (legacy flow) ───────────────────────────────────────
    if (isAnalyzing) {
        return <AnalyzingOverlay />
    }

    // ── Gallery AI Loading overlay ─────────────────────────────────────────────
    if (isGalleryAnalyzing) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6">
                <div className="rounded-none border-4 border-black bg-[#FDC800] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm w-full">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1C293C]" />
                    <p className="font-bold text-[#1C293C] text-sm">
                        {GALLERY_STEP_LABELS[galleryLoadingStep]}
                    </p>
                    <p className="text-xs text-[#1C293C]/70 mt-1">
                        Running locally in your browser — no API cost
                    </p>
                </div>
                {/* Progress steps */}
                <div className="flex flex-col gap-2 w-full max-w-sm">
                    {([1, 2] as const).map((step) => (
                        <div
                            key={step}
                            className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
                                galleryLoadingStep >= step ? 'opacity-100' : 'opacity-30'
                            }`}
                        >
                            <div
                                className={`w-6 h-6 rounded-none border-2 border-black flex items-center justify-center text-xs font-bold ${
                                    galleryLoadingStep > step
                                        ? 'bg-green-400'
                                        : galleryLoadingStep === step
                                        ? 'bg-[#FDC800] animate-pulse'
                                        : 'bg-[#FBFBF9]'
                                }`}
                            >
                                {galleryLoadingStep > step ? '✓' : step}
                            </div>
                            <span className="text-[#1C293C]">{GALLERY_STEP_LABELS[step]}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    // ── Project Selection Hub (CONSULTING_GALLERY phase) ──────────────────────
    if (galleryPhase === 'CONSULTING_GALLERY') {
        return (
            <div className="px-6 sm:px-8 pt-8 pb-20 max-w-3xl mx-auto">
                <ProjectSelectionHub
                    onJobQueued={(jobId) => {
                        setGalleryJobId(jobId)
                        setJobId(jobId)
                    }}
                />
            </div>
        )
    }

    // ── Gallery Finalizing (polling) ───────────────────────────────────────────
    if (galleryPhase === 'FINALIZING') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
                <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm w-full">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#1C293C]" />
                    <p className="font-bold text-[#1C293C] text-sm">
                        Generating your strategic CV…
                    </p>
                    <p className="text-xs text-[#4B5563] mt-1">
                        Gemini is rewriting your CV with the selected projects.
                    </p>
                </div>
            </div>
        )
    }

    // ── Gallery Error ─────────────────────────────────────────────────────────
    if (galleryPhase === 'ERROR') {
        return <GalleryErrorPanel />
    }

    // ── Analysis results (legacy dashboard) ───────────────────────────────────
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
                    <p className="text-[#4B5563] text-base mb-6">
                        Your CV has been analyzed. Choose how to enhance it:
                    </p>

                    {/* Enhancement mode selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        {/* Button A — Quick Enhance */}
                        <button
                            type="button"
                            onClick={handleEnhanceWithAI}
                            className="
                                flex flex-col items-start gap-2 p-5 text-left
                                rounded-none border-4 border-black bg-[#FBFBF9]
                                shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                                hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]
                                transition-all duration-200
                            "
                        >
                            <div className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-[#1C293C]" />
                                <span className="font-bold text-[#1C293C] text-sm">
                                    Quick Enhance (ATS-Friendly)
                                </span>
                            </div>
                            <p className="text-xs text-[#4B5563] leading-relaxed">
                                Instantly rewrite your CV using AI — STAR method, keyword
                                optimisation, red flag fixes. Best when your CV already has
                                relevant experience.
                            </p>
                        </button>

                        {/* Button B — Strategic Gallery */}
                        <button
                            type="button"
                            onClick={handleStrategicAnalyze}
                            disabled={projectGallery.length === 0}
                            className="
                                flex flex-col items-start gap-2 p-5 text-left
                                rounded-none border-4 border-black bg-[#FDC800]
                                shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                                hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]
                                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                                transition-all duration-200
                            "
                        >
                            <div className="flex items-center gap-2">
                                <BookMarked className="w-5 h-5 text-[#1C293C]" />
                                <span className="font-bold text-[#1C293C] text-sm">
                                    Optimize with Project Gallery ✨
                                </span>
                            </div>
                            <p className="text-xs text-[#1C293C]/80 leading-relaxed">
                                AI ranks your saved projects by JD relevance and injects them
                                into your CV — free, runs entirely in your browser.
                                {projectGallery.length === 0 && (
                                    <span className="block mt-1 font-semibold">
                                        Add projects to your Gallery first.
                                    </span>
                                )}
                            </p>
                        </button>
                    </div>

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
                    <strong className="text-[#1C293C]">Radiance</strong> analyzes the gap
                    and enhances the CV to be more attractive.
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

// ── Sub-components ────────────────────────────────────────────────────────────

function GalleryErrorPanel() {
    const { galleryError, resetGallery } = useCVStore()
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
            <div className="rounded-none border-4 border-black bg-[#FBFBF9] p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center max-w-sm w-full">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-red-500" />
                <p className="font-bold text-[#1C293C] text-sm">Something went wrong</p>
                <p className="text-xs text-[#4B5563] mt-1">{galleryError}</p>
                <button
                    type="button"
                    onClick={resetGallery}
                    className="mt-4 px-4 py-2 rounded-none border-2 border-black bg-[#FDC800] text-sm font-bold text-[#1C293C] hover:opacity-80 transition-opacity"
                >
                    Try Again
                </button>
            </div>
        </div>
    )
}
