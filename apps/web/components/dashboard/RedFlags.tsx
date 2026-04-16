'use client'

import { AlertTriangle } from 'lucide-react'
import type { RedFlagDTO } from '@/services/api'

interface RedFlagsProps {
  flags: RedFlagDTO[]
  className?: string
}

const severityStyles: Record<
  string,
  { border: string; icon: string; label: string }
> = {
  high: {
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
    label: 'High',
  },
  medium: {
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
    label: 'Medium',
  },
  low: {
    border: 'border-slate-500/30',
    icon: 'text-slate-400',
    label: 'Low',
  },
}

function getStyle(severity: string) {
  return (
    severityStyles[severity.toLowerCase()] ?? severityStyles['low']
  )
}

export function RedFlags({ flags, className = '' }: RedFlagsProps) {
  if (flags.length === 0) {
    return (
      <div
        className={`rounded-none border-4 border-black bg-[#FBFBF9] p-5 ${className}`}
      >
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#4B5563] mb-3">
          Red flags
        </h3>
        <p className="text-[#4B5563] text-sm">No red flags identified.</p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-none border-4 border-black bg-[#FBFBF9] p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#4B5563] mb-3">
        Red flags ({flags.length})
      </h3>
      <ul className="flex flex-col gap-3">
        {flags.map((flag, i) => {
          const style = getStyle(flag.severity)
          return (
            <li
              key={`${flag.title}-${i}`}
              className={`rounded-none border-4 border-black px-4 py-3 ${style.border}`}
            >
              <div className="flex gap-3">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${style.icon}`}
                  strokeWidth={2}
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-[#1C293C]">
                      {flag.title}
                    </span>
                    <span
                      className={`text-xs font-medium ${style.icon}`}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="text-[#4B5563] text-sm leading-relaxed">
                    {flag.description}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
