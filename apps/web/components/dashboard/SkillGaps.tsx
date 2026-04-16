'use client'

import type { SkillGapDTO } from '@/services/api'

interface SkillGapsProps {
  gaps: SkillGapDTO[]
  className?: string
}

const importanceStyles: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  critical: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-300',
    label: 'Critical',
  },
  recommended: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-300',
    label: 'Recommended',
  },
  'nice-to-have': {
    bg: 'bg-slate-500/15',
    text: 'text-slate-300',
    label: 'Nice to have',
  },
}

function getStyle(importance: string) {
  return (
    importanceStyles[importance.toLowerCase()] ?? importanceStyles['nice-to-have']
  )
}

export function SkillGaps({ gaps, className = '' }: SkillGapsProps) {
  if (gaps.length === 0) {
    return (
      <div
        className={`rounded-none border-4 border-black bg-[#FBFBF9] p-5 ${className}`}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#4B5563] mb-3">
          Skill gaps
        </h3>
        <p className="text-[#4B5563] text-sm">No major gaps identified.</p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-none border-4 border-black bg-[#FBFBF9] p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#4B5563] mb-3">
        Skill gaps ({gaps.length})
      </h3>
      <ul className="flex flex-col gap-2">
        {gaps.map((gap, i) => {
          const style = getStyle(gap.importance)
          return (
            <li
              key={`${gap.skill}-${i}`}
              className={`flex items-center justify-between gap-3 rounded-none border-4 border-black px-3 py-2 ${style.bg}`}
            >
              <span className={`text-sm font-medium ${style.text}`}>
                {gap.skill}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-none border-4 border-black ${style.text} ${style.bg}`}
              >
                {style.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
