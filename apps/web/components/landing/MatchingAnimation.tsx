'use client'

import { motion } from 'framer-motion'
import { Cpu } from 'lucide-react'

export default function MatchingAnimation() {
    return (
        <svg
            viewBox="0 0 500 300"
            className="w-full max-w-[min(100%,42rem)] lg:max-w-[min(100%,52rem)] xl:max-w-[min(100%,60rem)] h-auto aspect-[5/3]"
            preserveAspectRatio="xMidYMid meet"
        >
            <motion.g
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1 }}
            >
                <rect x="50" y="80" width="100" height="140" fill="white" stroke="black" strokeWidth="4" />
                <rect x="65" y="100" width="70" height="6" fill="#1C293C" />
                <rect x="65" y="115" width="40" height="6" fill="#1C293C" opacity="0.3" />
                <motion.circle
                    cx="130" cy="95" r="10" fill="#DC2626" stroke="black" strokeWidth="2"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                />
                <text x="100" y="245" textAnchor="middle" fill="black" fontSize="12" fontWeight="bold" letterSpacing="2">
                    Raw Profile
                </text>
            </motion.g>

            <motion.g transform="translate(250, 150)">
                <motion.g
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                >
                    <rect
                        width="60"
                        height="60"
                        x="-30"
                        y="-30"
                        fill="#FDC800"
                        stroke="black"
                        strokeWidth="4"
                    />
                </motion.g>
                <foreignObject x="-14" y="-14" width="28" height="28">
                    <Cpu size={28} color="black" />
                </foreignObject>
            </motion.g>

            <path d="M 160 150 L 340 150" stroke="black" strokeWidth="4" strokeDasharray="8,8" />

            <motion.g
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
            >
                <rect x="350" y="70" width="110" height="160" fill="#FDC800" stroke="black" strokeWidth="4" />
                <rect x="365" y="90" width="80" height="8" fill="black" />
                {[0, 1, 2, 3].map(i => (
                    <rect
                        key={i}
                        x="365"
                        y={115 + i * 20}
                        width={70 - i * 5}
                        height="6"
                        fill="black"
                    />
                ))}
                <motion.circle
                    cx="445" cy="85" r="10" fill="#16A34A" stroke="black" strokeWidth="2"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                />
                <text x="405" y="255" textAnchor="middle" fill="black" fontSize="12" fontWeight="bold" letterSpacing="2">
                    Optimized CV
                </text>
            </motion.g>
        </svg>
    )
}
