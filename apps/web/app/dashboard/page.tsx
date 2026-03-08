'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { NavBar } from '@/components/ui/NavBar'
import { AnalysisDashboard } from '@/components/dashboard/AnalysisDashboard'
import { useCVStore } from '@/store/useCVStore'

export default function DashboardPage() {
  const router = useRouter()
  const {
    analysisResult,
    setCvData,
    setPdfUrl,
    setPhase,
  } = useCVStore()

  useEffect(() => {
    if (analysisResult === null) {
      router.replace('/')
    }
  }, [analysisResult, router])

  const handleEnhanceWithAI = () => {
    if (!analysisResult) return
    setCvData(analysisResult.enhanced_cv_json)
    setPdfUrl(analysisResult.pdf_url)
    setPhase('workspace')
    router.push('/workspace')
  }

  if (analysisResult === null) {
    return null
  }

  return (
    <div className="min-h-screen bg-midnight overflow-x-hidden overflow-y-auto">
      <div className="glow-blob w-[600px] h-[600px] -top-32 -left-32 bg-blue-700/15" />
      <div className="glow-blob w-[500px] h-[500px] top-1/2 -right-40 bg-violet-700/12" />
      <div className="fixed inset-0 bg-grid opacity-100 pointer-events-none" />

      <NavBar activeStep={2} />

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 sm:px-8 pt-8 pb-20">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 text-sm font-medium hover:text-slate-300 hover:bg-white/5 transition-all duration-200 mb-8"
        >
          <ChevronLeft className="w-4 h-4" />
          Upload
        </button>

        <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
            Analysis dashboard
          </h1>
          <p className="text-slate-400 text-base mb-10">
            Your CV has been analyzed against the job description. Review the
            results below.
          </p>

          <AnalysisDashboard
            result={analysisResult}
            onEnhanceWithAI={handleEnhanceWithAI}
          />
        </div>
      </main>
    </div>
  )
}
