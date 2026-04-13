'use client'

import { motion } from 'framer-motion'

const STAR_LETTERS = ['S', 'T', 'A', 'R'] as const

export default function StarAnimation() {
    return (
        <div className="relative w-full max-w-md h-48 flex items-center justify-center">
            <motion.div
                className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-3xl rounded-full"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 4 }}
            />
            <div className="z-10 text-center space-y-4">
                <div className="flex justify-center space-x-2">
                    {STAR_LETTERS.map((letter, i) => (
                        <motion.div
                            key={letter}
                            className="w-12 h-12 border border-[#f0f0fa]/30 flex items-center justify-center font-bold text-[#f0f0fa]"
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
                    className="text-[10px] tracking-[2px] uppercase text-indigo-300"
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                >
                    REWRITING WITH IMPACT...
                </motion.div>
            </div>
        </div>
    )
}
