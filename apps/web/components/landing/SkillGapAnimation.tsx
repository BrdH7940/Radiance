'use client'

import { motion } from 'framer-motion'
import { FileText, Search } from 'lucide-react'

export default function SkillGapAnimation() {
    return (
        <div className="relative w-full max-w-[min(100%,42rem)] lg:max-w-[min(100%,52rem)] xl:max-w-[min(100%,58rem)] h-[19rem] sm:h-[22rem] md:h-[26rem] lg:h-[30rem] bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-white/5">
            <svg viewBox="0 0 400 300" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                {/* Dynamic Gap Line - behind other elements */}
                <motion.line
                    x1={0} y1={160} x2={300} y2={160}
                    strokeWidth="3"
                    animate={{
                        x1: [80, 180, 80],
                        stroke: ['#ef4444', '#22c55e', '#ef4444'],
                        strokeDasharray: ['8,4', '0,0', '8,4'],
                    }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* Node A: User CV */}
                <motion.g
                    animate={{ x: [50, 120, 50], opacity: [1, 1, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <rect x="0" y="120" width="60" height="80" rx="4" fill="rgba(10,10,46,0.95)" stroke="#6366f1" strokeWidth="1.5" />
                    <foreignObject x="14" y="138" width="32" height="32">
                        <FileText size={32} color="#6366f1" />
                    </foreignObject>
                    <text x="30" y="220" textAnchor="middle" fill="#f0f0fa" fontSize="10" letterSpacing="1">Your CV</text>
                </motion.g>

                {/* Node B: Market JD */}
                <g transform="translate(300, 120)">
                    <rect width="60" height="80" rx="4" fill="rgba(26,11,46,0.95)" stroke="#a855f7" strokeWidth="1.5" />
                    <foreignObject x="14" y="18" width="32" height="32">
                        <Search size={32} color="#a855f7" />
                    </foreignObject>
                    <text x="30" y="100" textAnchor="middle" fill="#f0f0fa" fontSize="10" letterSpacing="1">Target JD</text>
                </g>

                {/* Status Label */}
                <motion.g
                    animate={{ x: [190, 240, 190], opacity: [1, 1, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <rect x="-44" y="172" width="88" height="24" rx="12" fill="black" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                    <motion.text
                        x="0" y="189" textAnchor="middle"
                        fontSize="10" fontWeight="bold" letterSpacing="1"
                        animate={{ fill: ['#ef4444', '#22c55e', '#ef4444'] }}
                        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        ANALYZING
                    </motion.text>
                </motion.g>
            </svg>

            <div className="absolute top-5 left-5 text-[9px] md:text-[10px] tracking-[2px] uppercase opacity-40 text-[#f0f0fa]">
                Sync Protocol Active
            </div>
        </div>
    )
}
