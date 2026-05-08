/**
 * useProjectGallery — loads the user's project gallery once and caches it in
 * the Zustand store. Subsequent calls on the same user return immediately from
 * the cache without hitting the network.
 *
 * Used by both the dashboard and workspace pages.
 */

'use client'

import { useEffect } from 'react'
import { useCVStore } from '@/store/useCVStore'

export function useProjectGallery() {
    const { user, projectGallery, galleryOwnerUserId, setProjectGallery } =
        useCVStore()

    useEffect(() => {
        const currentUserId = user?.id ?? null
        if (!currentUserId) return

        // Reuse the cached gallery when it belongs to the current user.
        if (projectGallery.length > 0 && galleryOwnerUserId === currentUserId) return

        const load = async () => {
            try {
                const { getSupabaseToken } = await import('@/services/api')
                const token = await getSupabaseToken()
                if (!token) return

                const API_BASE =
                    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
                const res = await fetch(`${API_BASE}/api/v1/projects`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (!res.ok) return

                const data = (await res.json()) as Array<{
                    id: string
                    title: string
                    description: string | null
                    technologies: string[]
                }>
                setProjectGallery(
                    data.map((p) => ({
                        id: p.id,
                        title: p.title,
                        description: p.description,
                        tech_stack: p.technologies,
                    })),
                    currentUserId
                )
            } catch {
                // Non-fatal — gallery is optional for the legacy flow.
            }
        }
        void load()
    }, [user?.id, projectGallery.length, galleryOwnerUserId, setProjectGallery])
}
