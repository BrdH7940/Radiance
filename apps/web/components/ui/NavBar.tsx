'use client'

import { Zap } from 'lucide-react'

const STEPS = [
    { number: 1, label: 'Input' },
    { number: 2, label: 'Analysis' },
    { number: 3, label: 'Forge' },
]

interface NavBarProps {
    activeStep?: number
    onStepClick?: (step: number) => void
}

export function NavBar({ activeStep = 1, onStepClick }: NavBarProps) {
    return (
        <nav className="sticky top-0 z-50 h-20 flex items-center border-b-4 border-black bg-[#FBFBF9]">
            <div className="w-full max-w-screen-xl mx-auto px-8 flex items-center justify-between">
                {/* Brand */}
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 border-4 border-black bg-[#FDC800] flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                        <Zap className="w-4 h-4 text-black" strokeWidth={2.5} />
                    </div>
                    <span className="text-[#1C293C] font-black tracking-tighter text-xl">
                        Radiance
                    </span>
                </div>

                {/* Steps */}
                <div className="flex items-center gap-1.5">
                    {STEPS.map((step, i) => {
                        const isActive = step.number === activeStep
                        const isDone = step.number < activeStep

                        return (
                            <div
                                key={step.number}
                                className="flex items-center gap-1.5"
                            >
                                <button
                                    type="button"
                                    onClick={() => onStepClick?.(step.number)}
                                    className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-none transition-all duration-500
                    hover:translate-x-[2px] hover:translate-y-[2px]
                    ${
                        isActive
                            ? 'bg-[#432DD7] border-4 border-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                            : isDone
                              ? 'bg-[#FBFBF9] border-4 border-black text-[#1C293C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                              : 'bg-[#FBFBF9] border-4 border-black text-[#1C293C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                    }
                  `}
                                >
                                    <span
                                        className={`
                      w-5 h-5 rounded-none flex items-center justify-center text-xs font-bold transition-all duration-500
                      ${
                          isActive
                              ? 'bg-[#FDC800] text-black'
                              : isDone
                                ? 'bg-[#FBFBF9] text-[#1C293C]'
                                : 'bg-[#FBFBF9] text-[#1C293C]'
                      }
                    `}
                                    >
                                        {step.number}
                                    </span>
                                    <span className="text-xs font-medium tracking-widest uppercase hidden sm:block">
                                        {step.label}
                                    </span>
                                </button>

                                {i < STEPS.length - 1 && (
                                    <div className="w-6 h-1 bg-black" />
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-none border-4 border-black bg-[#16A34A]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-medium text-[#FBFBF9] tracking-wider">
                        Model Active
                    </span>
                </div>
            </div>
        </nav>
    )
}
