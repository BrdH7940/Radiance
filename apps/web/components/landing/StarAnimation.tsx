'use client'

import { motion } from 'framer-motion'

const STAR_LETTERS = ['S', 'T', 'A', 'R'] as const

export default function StarAnimation() {
    return (
        <div className="relative w-full max-w-[min(100%,40rem)] lg:max-w-[min(100%,48rem)] min-h-[14rem] md:min-h-[18rem] lg:min-h-[22rem] flex items-center justify-center py-6">
            <div className="z-10 text-center space-y-5 md:space-y-6">
                <div className="flex justify-center gap-2 sm:gap-3 md:gap-4">
                    {STAR_LETTERS.map((letter, i) => (
                        <motion.div
                            key={letter}
                            className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 border-4 border-black bg-white flex items-center justify-center font-bold text-black text-lg sm:text-xl md:text-2xl lg:text-3xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                            animate={{
                                backgroundColor: i % 2 === 0
                                    ? ['#FFFFFF', '#FDC800', '#FFFFFF']
                                    : ['#FFFFFF', '#432DD7', '#FFFFFF'],
                                color: i % 2 === 0
                                    ? ['#000000', '#000000', '#000000']
                                    : ['#000000', '#FFFFFF', '#000000'],
                                translateY: [0, -8, 0],
                                boxShadow: [
                                    '4px 4px 0px 0px rgba(0,0,0,1)',
                                    '4px 8px 0px 0px rgba(0,0,0,1)',
                                    '4px 4px 0px 0px rgba(0,0,0,1)',
                                ],
                            }}
                            transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }}
                        >
                            {letter}
                        </motion.div>
                    ))}
                </div>
                <motion.div
                    className="text-[11px] sm:text-xs md:text-sm tracking-[2px] uppercase text-black"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                >
                    REWRITING WITH IMPACT...
                </motion.div>
            </div>
        </div>
    )
}
