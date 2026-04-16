'use client'

import { CheckCircle, Loader2 } from 'lucide-react'
import { useCVStore } from '@/store/useCVStore'

export function AnalyzingOverlay() {
    const { loadingSteps, loadingStepIndex } = useCVStore()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FBFBF9]/90 backdrop-blur-xl">
            {/* Glow blobs */}
            <div className="glow-blob w-[500px] h-[500px] top-[-100px] left-[-100px] bg-[#432DD7]/20 opacity-60" />
            <div className="glow-blob w-[400px] h-[400px] bottom-[-80px] right-[-80px] bg-[#FDC800]/20 opacity-50" />

            <div className="relative z-10 flex flex-col items-center gap-10 px-8 max-w-md w-full">
                {/* Spinner ring */}
                <div className="relative w-24 h-24">
                    <div className="absolute inset-0 rounded-full border-4 border-black/10" />
                    <div className="absolute inset-0 rounded-full border-4 border-t-[#432DD7] border-r-[#432DD7] border-b-transparent border-l-transparent animate-spin" />
                    <div
                        className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-[#432DD7]/50 border-l-[#432DD7]/50 animate-spin"
                        style={{
                            animationDuration: '1.5s',
                            animationDirection: 'reverse',
                        }}
                    />
                </div>

                {/* Heading */}
                <div className="text-center">
                    <h2 className="text-2xl font-black tracking-tight text-[#1C293C] mb-2">
                        Crafting Your CV
                    </h2>
                    <p className="text-[#4B5563] text-sm">
                        AI is analyzing your documents — this takes a moment.
                    </p>
                </div>

                {/* Steps list */}
                <div className="w-full flex flex-col gap-2">
                    {loadingSteps.map((step, i) => {
                        const isActive = i === loadingStepIndex
                        const isDone = i < loadingStepIndex

                        return (
                            <div
                                key={step.id}
                                className={`
                  flex items-center gap-3 px-4 py-3 rounded-none border-4 border-black transition-all duration-700
                  ${
                      isActive
                          ? 'border-black bg-[#FDC800] text-[#1C293C]'
                          : isDone
                            ? 'border-black/20 bg-[#FBFBF9] text-[#4B5563]'
                            : 'border-black/0 bg-transparent text-[#4B5563]'
                  }
                `}
                                style={{
                                    opacity: isDone ? 0.7 : isActive ? 1 : 0.35,
                                    transform: isActive
                                        ? 'scale(1.01)'
                                        : 'scale(1)',
                                }}
                            >
                                {isDone ? (
                                    <CheckCircle
                                        className="w-4 h-4 text-emerald-400 shrink-0"
                                        strokeWidth={2}
                                    />
                                ) : isActive ? (
                                    <Loader2
                                        className="w-4 h-4 text-blue-400 shrink-0 animate-spin"
                                        strokeWidth={2}
                                    />
                                ) : (
                                    <span className="w-4 h-4 rounded-full border border-white/10 shrink-0" />
                                )}

                                <span
                                    className={`text-base font-medium ${isActive ? 'text-[#1C293C]' : ''}`}
                                >
                                    {step.label}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 rounded-full bg-black/10 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-[#432DD7] to-[#FDC800] transition-all duration-700 ease-out"
                        style={{
                            width: `${((loadingStepIndex + 1) / loadingSteps.length) * 100}%`,
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
