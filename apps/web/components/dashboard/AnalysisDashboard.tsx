'use client'

import { Sparkles } from 'lucide-react'
import { ScoreGauge } from './ScoreGauge'
import { SkillGaps } from './SkillGaps'
import { RedFlags } from './RedFlags'
import type { AnalysisResultState } from '@/store/useCVStore'

interface AnalysisDashboardProps {
  result: AnalysisResultState
  onEnhanceWithAI: () => void
  className?: string
}

export function AnalysisDashboard({
  result,
  onEnhanceWithAI,
  className = '',
}: AnalysisDashboardProps) {
  return (
    <div className={`space-y-8 ${className}`}>
      {/* Score + CTA row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-none border-4 border-black bg-[#FBFBF9] p-6 sm:p-8">
        <div className="flex flex-col items-center gap-2">
          <ScoreGauge score={result.matching_score} />
          <p className="text-[#4B5563] text-sm font-medium">
            ATS match score
          </p>
        </div>
        <div className="flex-1 max-w-md text-center sm:text-left">
          <h2 className="text-lg font-bold text-[#1C293C] mb-2">
            Analysis complete
          </h2>
          <p className="text-[#4B5563] text-sm leading-relaxed mb-6">
            Review gaps and red flags below, then open the LaTeX editor to
            refine your CV or download the enhanced PDF.
          </p>
          <button
            type="button"
            onClick={onEnhanceWithAI}
            className="
              inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl
              font-bold text-sm tracking-wide
              rounded-none border-4 border-black bg-[#FDC800] text-[#1C293C] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
              hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] hover:brightness-110
              transition-all duration-300
            "
          >
            <Sparkles className="w-4 h-4" strokeWidth={2.5} />
            Enhance with AI
          </button>
        </div>
      </div>

      {/* Gaps + Red flags grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkillGaps gaps={result.missing_skills} />
        <RedFlags flags={result.red_flags} />
      </div>
    </div>
  )
}
