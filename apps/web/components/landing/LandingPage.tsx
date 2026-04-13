'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import MatchingAnimation from './MatchingAnimation'
import SkillGapAnimation from './SkillGapAnimation'
import StarAnimation from './StarAnimation'

interface GhostButtonProps {
    children: React.ReactNode
    onClick?: () => void
    className?: string
}

function GhostButton({ children, onClick, className = '' }: GhostButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`px-8 py-4 rounded-full border border-[rgba(240,240,250,0.35)] bg-[rgba(240,240,250,0.1)]
                       text-[#f0f0fa] uppercase tracking-[1.17px] font-bold text-[13px]
                       hover:bg-[rgba(240,240,250,0.2)] hover:border-[#f0f0fa] transition-all duration-300 ${className}`}
        >
            {children}
        </button>
    )
}

interface StarParticle {
    width: number
    height: number
    left: string
    top: string
    duration: number
}

export default function LandingPage() {
    const router = useRouter()
    const [scrolled, setScrolled] = useState(false)

    // Stable random particles to avoid hydration mismatch
    const particles = useMemo<StarParticle[]>(() => {
        const rng = (seed: number) => {
            let s = seed
            return () => {
                s = (s * 16807 + 0) % 2147483647
                return (s - 1) / 2147483646
            }
        }
        const rand = rng(42)
        return Array.from({ length: 20 }, () => ({
            width: rand() * 3,
            height: rand() * 3,
            left: `${rand() * 100}%`,
            top: `${rand() * 100}%`,
            duration: rand() * 10 + 5,
        }))
    }, [])

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 50)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    const goToLogin = () => router.push('/login')

    return (
        <div className="bg-[#000000] text-[#f0f0fa] font-sans selection:bg-indigo-500 selection:text-white">
            {/* Navigation */}
            <nav
                className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 px-8 py-6 flex justify-between items-center ${
                    scrolled ? 'bg-black/80 backdrop-blur-md' : 'bg-transparent'
                }`}
            >
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-sm flex items-center justify-center">
                        <Zap size={18} fill="white" color="white" />
                    </div>
                    <span className="text-xl font-bold tracking-[3px] uppercase">
                        Radiance
                    </span>
                </div>
                <GhostButton onClick={goToLogin}>Get started</GhostButton>
            </nav>

            {/* Hero Section */}
            <section className="relative h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden">
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#000000] via-[#0a0a2e] to-[#1a0b2e]" />
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    {particles.map((p, i) => (
                        <motion.div
                            key={i}
                            className="absolute bg-white rounded-full"
                            style={{
                                width: p.width,
                                height: p.height,
                                left: p.left,
                                top: p.top,
                            }}
                            animate={{ y: [0, -100], opacity: [0, 1, 0] }}
                            transition={{
                                duration: p.duration,
                                repeat: Infinity,
                                ease: 'linear',
                            }}
                        />
                    ))}
                </div>
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="z-10 max-w-4xl"
                >
                    <h1 className="text-4xl md:text-6xl font-bold tracking-[8px] uppercase leading-tight mb-6">
                        Dominate Every <br /> Internship Opportunity
                    </h1>
                    <p className="text-sm md:text-base tracking-[1.5px] uppercase max-w-xl mx-auto mb-10 opacity-80 leading-relaxed">
                        Radiance bypasses the ATS barrier <br />
                        Using semantic intelligence and STAR alignment.
                    </p>
                    <GhostButton onClick={goToLogin}>
                        Launch Mission
                    </GhostButton>
                </motion.div>
                <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-50"
                >
                    <div className="w-[1px] h-16 bg-gradient-to-b from-transparent to-[#f0f0fa]" />
                </motion.div>
            </section>

            {/* Feature 1: Semantic Alignment */}
            <section className="min-h-screen flex items-center px-6 sm:px-10 md:px-16 lg:px-24 bg-black py-16 md:py-0">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="order-2 md:order-1 space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-indigo-400 uppercase font-bold">
                            01
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Semantic <br /> Alignment
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase opacity-70 leading-relaxed max-w-md">
                            We read the JD and transform your CV <br />
                            into a JD-specialized version.
                        </p>
                    </div>
                    <div className="order-1 md:order-2 flex justify-center items-center w-full min-h-[min(55vh,26rem)] md:min-h-[min(70vh,32rem)] lg:min-h-[36rem]">
                        <MatchingAnimation />
                    </div>
                </div>
            </section>

            {/* Feature 2: Skill Gap Detection */}
            <section className="min-h-screen flex items-center px-6 sm:px-10 md:px-16 lg:px-24 bg-gradient-to-r from-black to-[#0a0a2e] py-16 md:py-0">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="flex justify-center items-center w-full min-h-[min(55vh,22rem)] md:min-h-[min(70vh,28rem)] lg:min-h-[32rem]">
                        <SkillGapAnimation />
                    </div>
                    <div className="space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-purple-400 uppercase font-bold">
                            02
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Skill Gap <br /> Detection
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase opacity-70 leading-relaxed max-w-md">
                            Instantly identify missing keywords and skills.{' '}
                            <br />
                            We compare your CV against the JD <br />
                            to highlight and bridge critical weaknesses.
                        </p>
                    </div>
                </div>
            </section>

            {/* Feature 3: STAR Enhancement */}
            <section className="min-h-screen flex items-center px-6 sm:px-10 md:px-16 lg:px-24 bg-black py-16 md:py-0">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="order-2 md:order-1 space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-blue-400 uppercase font-bold">
                            03
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Automated <br /> STAR Polish
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase opacity-70 leading-relaxed max-w-md">
                            We rewrite your experience bullets <br />
                            using the STAR methodology.
                        </p>
                    </div>
                    <div className="order-1 md:order-2 flex justify-center items-center w-full min-h-[min(55vh,22rem)] md:min-h-[min(70vh,28rem)] lg:min-h-[32rem]">
                        <StarAnimation />
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="h-screen flex flex-col items-center justify-center text-center px-4 bg-gradient-to-t from-[#000000] to-[#1a0b2e]">
                <motion.div
                    whileInView={{ opacity: 1, scale: 1 }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.6 }}
                    className="space-y-8"
                >
                    <h2 className="text-3xl md:text-5xl font-bold tracking-[6px] uppercase">
                        Ready to Experience?
                    </h2>
                    <p className="text-[12px] tracking-[2px] uppercase opacity-60">
                        Join us to reach new heights.
                    </p>
                    <div className="flex flex-col md:flex-row gap-4 justify-center">
                        <GhostButton onClick={goToLogin}>
                            Get started now
                        </GhostButton>
                    </div>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-8 border-t border-[#f0f0fa]/10 bg-black text-center">
                <div className="max-w-7xl mx-auto flex flex-col items-center">
                    <div className="text-[10px] tracking-[2px] uppercase opacity-40">
                        Radiance &copy; 2026 — Engineering the Future of Careers
                    </div>
                </div>
            </footer>
        </div>
    )
}
