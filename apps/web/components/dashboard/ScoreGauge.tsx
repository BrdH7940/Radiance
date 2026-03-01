'use client'

/**
 * Presentational: circular gauge for ATS matching score (0–100).
 */

interface ScoreGaugeProps {
  score: number
  size?: number
  strokeWidth?: number
  className?: string
}

export function ScoreGauge({
  score,
  size = 140,
  strokeWidth = 10,
  className = '',
}: ScoreGaugeProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  const color =
    clamped >= 70
      ? 'stroke-emerald-500'
      : clamped >= 50
        ? 'stroke-amber-500'
        : 'stroke-rose-500'

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-700 ease-out`}
        />
      </svg>
      <span className="absolute text-2xl sm:text-3xl font-black text-white tabular-nums">
        {clamped}
      </span>
    </div>
  )
}
