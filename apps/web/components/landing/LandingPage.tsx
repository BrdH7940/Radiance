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

interface BrutalButtonProps extends GhostButtonProps {
    variant?: 'primary' | 'secondary'
}

function BrutalButton({
    children,
    onClick,
    className = '',
    variant = 'primary',
}: BrutalButtonProps) {
    const bg = variant === 'primary' ? 'bg-[#FDC800]' : 'bg-[#FBFBF9]'

    return (
        <button
            onClick={onClick}
            className={`px-8 py-4 border-4 border-black ${bg} text-[#1C293C] uppercase tracking-[1.17px] font-bold text-[13px]
                       shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]
                       transition-all active:bg-opacity-90 ${className}`}
        >
            {children}
        </button>
    )
}

interface BrutalCardProps {
    children: React.ReactNode
    className?: string
}

function BrutalCard({ children, className = '' }: BrutalCardProps) {
    return (
        <div
            className={`border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${className}`}
        >
            {children}
        </div>
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
        <div className="bg-[#FBFBF9] text-[#1C293C] font-sans selection:bg-[#432DD7] selection:text-white">
            {/* Navigation */}
            <nav
                className={`fixed top-0 left-0 w-full z-50 px-8 py-6 flex justify-between items-center border-b-4 border-black bg-[#FBFBF9] transition-all ${
                    scrolled ? 'shadow-[0_6px_0px_0px_rgba(0,0,0,1)]' : ''
                }`}
            >
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 border-4 border-black bg-[#FDC800] flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                        <Zap size={18} fill="black" color="black" />
                    </div>
                    <span className="text-xl font-bold tracking-[3px] uppercase">
                        Radiance
                    </span>
                </div>
                <BrutalButton className="py-2" onClick={goToLogin}>
                    Get started
                </BrutalButton>
            </nav>

            {/* Hero Section */}
            <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 pt-20 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[#432DD7] via-[#FBFBF9] to-[#FDC800]" />
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    {particles.map((p, i) => (
                        <motion.div
                            key={i}
                            className="absolute bg-black rounded-full"
                            style={{
                                width: p.width,
                                height: p.height,
                                left: p.left,
                                top: p.top,
                            }}
                            animate={{ y: [0, -60, 0], opacity: [0.15, 0.4, 0.15] }}
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
                    <p className="text-sm md:text-base tracking-[1.5px] uppercase max-w-xl mx-auto mb-10 text-[#4B5563] leading-relaxed">
                        Radiance bypasses the ATS barrier <br />
                        Using semantic intelligence and STAR alignment.
                    </p>
                    <div className="flex justify-center">
                        <BrutalButton onClick={goToLogin}>Launch Mission</BrutalButton>
                    </div>
                </motion.div>
            </section>

            {/* Feature 1: Semantic Alignment */}
            <section className="py-24 px-6 sm:px-10 md:px-16 lg:px-24 border-t-4 border-black bg-[#FBFBF9]">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="order-2 md:order-1 space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-[#432DD7] uppercase font-bold">
                            01
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Semantic <br /> Alignment
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase text-[#4B5563] leading-relaxed max-w-md">
                            We read the JD and transform your CV <br />
                            into a JD-specialized version.
                        </p>
                    </div>
                    <div className="order-1 md:order-2 flex justify-center items-center w-full min-h-[min(55vh,26rem)] md:min-h-[min(70vh,32rem)] lg:min-h-[36rem]">
                        <BrutalCard className="w-full bg-white">
                        <MatchingAnimation />
                        </BrutalCard>
                    </div>
                </div>
            </section>

            {/* Feature 2: Skill Gap Detection */}
            <section className="py-24 px-6 sm:px-10 md:px-16 lg:px-24 border-t-4 border-black bg-[#FDC800]">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="flex justify-center items-center w-full min-h-[min(55vh,22rem)] md:min-h-[min(70vh,28rem)] lg:min-h-[32rem]">
                        <BrutalCard className="w-full bg-[#FBFBF9]">
                        <SkillGapAnimation />
                        </BrutalCard>
                    </div>
                    <div className="space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-black uppercase font-bold">
                            02
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Skill Gap <br /> Detection
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase text-black leading-relaxed max-w-md">
                            Instantly identify missing keywords and skills.{' '}
                            <br />
                            We compare your CV against the JD <br />
                            to highlight and bridge critical weaknesses.
                        </p>
                    </div>
                </div>
            </section>

            {/* Feature 3: STAR Enhancement */}
            <section className="py-24 px-6 sm:px-10 md:px-16 lg:px-24 border-t-4 border-black bg-[#FBFBF9]">
                <div className="grid md:grid-cols-2 gap-y-14 gap-x-10 lg:gap-x-16 xl:gap-x-24 items-center w-full max-w-[1600px] mx-auto">
                    <div className="order-2 md:order-1 space-y-6 md:max-w-lg lg:max-w-xl shrink-0">
                        <span className="text-sm tracking-[4px] text-[#16A34A] uppercase font-bold">
                            03
                        </span>
                        <h2 className="text-3xl md:text-5xl font-bold tracking-[4px] uppercase leading-tight">
                            Automated <br /> STAR Polish
                        </h2>
                        <p className="text-sm tracking-[1px] uppercase text-[#4B5563] leading-relaxed max-w-md">
                            We rewrite your experience bullets <br />
                            using the STAR methodology.
                        </p>
                    </div>
                    <div className="order-1 md:order-2 flex justify-center items-center w-full min-h-[min(55vh,22rem)] md:min-h-[min(70vh,28rem)] lg:min-h-[32rem]">
                        <BrutalCard className="w-full bg-[#FBFBF9]">
                        <StarAnimation />
                        </BrutalCard>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 flex flex-col items-center justify-center text-center px-4 border-t-4 border-black bg-[#432DD7] text-white">
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
                        <BrutalButton onClick={goToLogin}>
                            Get started now
                        </BrutalButton>
                    </div>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-8 border-t-4 border-black bg-white text-center">
                <div className="max-w-7xl mx-auto flex flex-col items-center">
                    <div className="text-[10px] tracking-[2px] uppercase opacity-60">
                        Radiance &copy; 2026 — Engineering the Future of Careers
                    </div>
                </div>
            </footer>
        </div>
    )
}
