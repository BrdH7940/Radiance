'use client'

import { motion } from 'framer-motion'

const STAR_LETTERS = ['S', 'T', 'A', 'R'] as const

export default function StarAnimation() {
    return (
        <div className="relative w-full max-w-[min(100%,40rem)] lg:max-w-[min(100%,48rem)] min-h-[14rem] md:min-h-[18rem] lg:min-h-[22rem] flex items-center justify-center py-6">
            <motion.div
                className="absolute inset-2 md:inset-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-[48px] md:blur-[64px] rounded-full scale-110"
                animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.65, 0.35] }}
                transition={{ repeat: Infinity, duration: 4 }}
            />
            <div className="z-10 text-center space-y-5 md:space-y-6">
                <div className="flex justify-center gap-2 sm:gap-3 md:gap-4">
                    {STAR_LETTERS.map((letter, i) => (
                        <motion.div
                            key={letter}
                            className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 border-2 border-[#f0f0fa]/30 flex items-center justify-center font-bold text-[#f0f0fa] text-lg sm:text-xl md:text-2xl lg:text-3xl"
                            animate={{
                                borderColor: [
                                    'rgba(240,240,250,0.3)',
                                    'rgba(168,85,247,1)',
                                    'rgba(240,240,250,0.3)',
                                ],
                            }}
                            transition={{ repeat: Infinity, duration: 2, delay: i * 0.5 }}
                        >
                            {letter}
                        </motion.div>
                    ))}
                </div>
                <motion.div
                    className="text-[11px] sm:text-xs md:text-sm tracking-[2px] uppercase text-indigo-300"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                >
                    REWRITING WITH IMPACT...
                </motion.div>
            </div>
        </div>
    )
}
