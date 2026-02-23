'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { useCVStore } from '@/store/useCVStore';

export function AnalyzingOverlay() {
  const { loadingSteps, loadingStepIndex } = useCVStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/90 backdrop-blur-xl">
      {/* Glow blobs */}
      <div className="glow-blob w-[500px] h-[500px] top-[-100px] left-[-100px] bg-blue-700/20 opacity-60" />
      <div className="glow-blob w-[400px] h-[400px] bottom-[-80px] right-[-80px] bg-violet-700/20 opacity-50" />

      <div className="relative z-10 flex flex-col items-center gap-10 px-8 max-w-md w-full">
        {/* Spinner ring */}
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-white/5" />
          <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-r-violet-500 border-b-transparent border-l-transparent animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-indigo-500/50 border-l-indigo-500/50 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
        </div>

        {/* Heading */}
        <div className="text-center">
          <h2 className="text-2xl font-black tracking-tight text-white mb-2">
            Crafting Your CV
          </h2>
          <p className="text-slate-500 text-sm">
            AI is analyzing your documents — this takes a moment.
          </p>
        </div>

        {/* Steps list */}
        <div className="w-full flex flex-col gap-2">
          {loadingSteps.map((step, i) => {
            const isActive = i === loadingStepIndex;
            const isDone = i < loadingStepIndex;

            return (
              <div
                key={step.id}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-700
                  ${isActive
                    ? 'border-blue-500/30 bg-blue-500/8 text-white'
                    : isDone
                      ? 'border-white/5 bg-white/[0.02] text-slate-500'
                      : 'border-transparent bg-transparent text-slate-700'
                  }
                `}
                style={{
                  opacity: isDone ? 0.7 : isActive ? 1 : 0.35,
                  transform: isActive ? 'scale(1.01)' : 'scale(1)',
                }}
              >
                {isDone ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-blue-400 shrink-0 animate-spin" strokeWidth={2} />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-white/10 shrink-0" />
                )}

                <span className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-700 ease-out"
            style={{
              width: `${((loadingStepIndex + 1) / loadingSteps.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
