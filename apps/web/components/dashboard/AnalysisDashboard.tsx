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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-2xl border border-white/5 bg-white/[0.02] p-6 sm:p-8">
        <div className="flex flex-col items-center gap-2">
          <ScoreGauge score={result.matching_score} />
          <p className="text-slate-400 text-sm font-medium">
            ATS match score
          </p>
        </div>
        <div className="flex-1 max-w-md text-center sm:text-left">
          <h2 className="text-lg font-bold text-white mb-2">
            Analysis complete
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Review gaps and red flags below, then open the LaTeX editor to
            refine your CV or download the enhanced PDF.
          </p>
          <button
            type="button"
            onClick={onEnhanceWithAI}
            className="
              inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl
              font-bold text-sm tracking-wide
              bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600
              text-white shadow-xl shadow-blue-900/40
              hover:shadow-blue-800/50 hover:scale-[1.02] hover:brightness-110
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
