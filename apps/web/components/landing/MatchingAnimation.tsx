'use client'

import { motion } from 'framer-motion'
import { Cpu } from 'lucide-react'

export default function MatchingAnimation() {
    return (
        <svg viewBox="0 0 500 300" className="w-full max-w-xl">
            <defs>
                <linearGradient id="bad-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4b5563" />
                    <stop offset="100%" stopColor="#1f2937" />
                </linearGradient>
                <linearGradient id="good-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
            </defs>

            <motion.g
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1 }}
            >
                <rect x="50" y="80" width="100" height="140" rx="4" fill="url(#bad-grad)" stroke="rgba(255,255,255,0.1)" />
                <rect x="65" y="100" width="70" height="4" rx="2" fill="rgba(255,255,255,0.2)" />
                <motion.circle
                    cx="130" cy="95" r="8" fill="#ef4444"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                />
                <text x="100" y="245" textAnchor="middle" fill="#f0f0fa" fontSize="10" fontWeight="bold" letterSpacing="2" opacity="0.5" textDecoration="uppercase">Raw Profile</text>
            </motion.g>

            <motion.g transform="translate(250, 150)">
                <motion.circle
                    r="40" stroke="#6366f1" strokeWidth="2" fill="none"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                />
                <motion.g
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                >
                    <circle cx="40" cy="0" r="4" fill="#a855f7" />
                    <circle cx="-40" cy="0" r="4" fill="#6366f1" />
                </motion.g>
                <foreignObject x="-12" y="-12" width="24" height="24">
                    <Cpu size={24} color="#f0f0fa" />
                </foreignObject>
            </motion.g>

            <motion.path
                d="M 160 150 L 210 150"
                stroke="rgba(240,240,250,0.2)"
                strokeDasharray="5,5"
                animate={{ strokeDashoffset: [-10, 0] }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
            <motion.path
                d="M 290 150 L 340 150"
                stroke="rgba(240,240,250,0.2)"
                strokeDasharray="5,5"
                animate={{ strokeDashoffset: [-10, 0] }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />

            <motion.g
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
            >
                <rect x="350" y="70" width="110" height="160" rx="4" fill="url(#good-grad)" stroke="rgba(255,255,255,0.3)" />
                <rect x="365" y="90" width="80" height="6" rx="2" fill="rgba(255,255,255,0.6)" />
                <motion.circle
                    cx="445" cy="85" r="8" fill="#22c55e"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                />
                <text x="405" y="255" textAnchor="middle" fill="#f0f0fa" fontSize="10" fontWeight="bold" letterSpacing="2">Optimized CV</text>
            </motion.g>
        </svg>
    )
}
