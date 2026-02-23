'use client';

import { Zap } from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Input' },
  { number: 2, label: 'Analysis' },
  { number: 3, label: 'Forge' },
];

interface NavBarProps {
  activeStep?: number;
}

export function NavBar({ activeStep = 1 }: NavBarProps) {
  return (
    <nav className="sticky top-0 z-50 h-20 flex items-center border-b border-white/5 backdrop-blur-3xl bg-midnight/60">
      <div className="w-full max-w-screen-xl mx-auto px-8 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-white font-black tracking-tighter text-xl">
            Radiance
          </span>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, i) => {
            const isActive = step.number === activeStep;
            const isDone = step.number < activeStep;

            return (
              <div key={step.number} className="flex items-center gap-1.5">
                <div
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-500
                    ${isActive
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300'
                      : isDone
                        ? 'bg-white/5 border border-white/10 text-slate-400'
                        : 'border border-transparent text-slate-600'
                    }
                  `}
                >
                  <span
                    className={`
                      w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold transition-all duration-500
                      ${isActive
                        ? 'bg-blue-500 text-white'
                        : isDone
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-white/5 text-slate-600'
                      }
                    `}
                  >
                    {step.number}
                  </span>
                  <span className="text-xs font-medium tracking-widest uppercase hidden sm:block">
                    {step.label}
                  </span>
                </div>

                {i < STEPS.length - 1 && (
                  <div className="w-6 h-px bg-white/10" />
                )}
              </div>
            );
          })}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400 tracking-wider">
            Model Active
          </span>
        </div>
      </div>
    </nav>
  );
}
