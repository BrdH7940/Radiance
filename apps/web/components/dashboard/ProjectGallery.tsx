'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Plus,
    Trash2,
    FolderOpen,
    X,
    Loader2,
    AlertCircle,
    Tag,
} from 'lucide-react'
import { type Project, createProject, deleteProject, getProjects } from '@/services/projectApi'

// ─── Add Project Modal ────────────────────────────────────────────────────────

interface AddProjectModalProps {
    onClose: () => void
    onCreated: (project: Project) => void
}

function AddProjectModal({ onClose, onCreated }: AddProjectModalProps) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [techInput, setTechInput] = useState('')
    const [technologies, setTechnologies] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const titleRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        titleRef.current?.focus()
    }, [])

    const addTech = () => {
        const tag = techInput.trim()
        if (tag && !technologies.includes(tag)) {
            setTechnologies((prev) => [...prev, tag])
        }
        setTechInput('')
    }

    const removeTech = (tag: string) => {
        setTechnologies((prev) => prev.filter((t) => t !== tag))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const project = await createProject({ title, description, technologies })
            onCreated(project)
            onClose()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create project.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1117] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <h2 className="text-base font-bold text-white">Add project</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-red-500/30 bg-red-500/5">
                            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Title */}
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            Title <span className="text-red-400">*</span>
                        </label>
                        <input
                            ref={titleRef}
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. E-commerce Platform"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of what you built and your role…"
                            rows={3}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
                        />
                    </div>

                    {/* Technologies */}
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">
                            Technologies
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={techInput}
                                onChange={(e) => setTechInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault()
                                        addTech()
                                    }
                                }}
                                placeholder="Type a tech and press Enter"
                                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                            />
                            <button
                                type="button"
                                onClick={addTech}
                                className="px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>

                        {technologies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {technologies.map((tech) => (
                                    <span
                                        key={tech}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium"
                                    >
                                        {tech}
                                        <button
                                            type="button"
                                            onClick={() => removeTech(tech)}
                                            className="hover:text-red-400 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/8 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Add project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
    project: Project
    onDelete: (id: string) => void
}

function ProjectCard({ project, onDelete }: ProjectCardProps) {
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        if (!confirm(`Delete "${project.title}"?`)) return
        setDeleting(true)
        try {
            await deleteProject(project.id)
            onDelete(project.id)
        } catch {
            setDeleting(false)
        }
    }

    return (
        <div className="group rounded-2xl border border-white/8 bg-white/2 hover:bg-white/4 hover:border-white/12 p-5 transition-all duration-200">
            <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-white leading-snug">
                    {project.title}
                </h3>
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                    title="Delete project"
                >
                    {deleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                    )}
                </button>
            </div>

            {project.description && (
                <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">
                    {project.description}
                </p>
            )}

            {project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {project.technologies.map((tech) => (
                        <span
                            key={tech}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/60 border border-white/6 text-slate-400 text-xs"
                        >
                            <Tag className="w-2.5 h-2.5" />
                            {tech}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectGallery() {
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)

    const fetchProjects = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getProjects()
            setProjects(data)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load projects.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProjects()
    }, [fetchProjects])

    const handleCreated = (project: Project) => {
        setProjects((prev) => [project, ...prev])
    }

    const handleDeleted = (id: string) => {
        setProjects((prev) => prev.filter((p) => p.id !== id))
    }

    return (
        <>
            {showModal && (
                <AddProjectModal
                    onClose={() => setShowModal(false)}
                    onCreated={handleCreated}
                />
            )}

            <div className="px-6 sm:px-8 pt-10 pb-20">
                {/* Header */}
                <div className="flex items-start justify-between mb-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                    <div>
                        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
                            Project Gallery
                        </h1>
                        <p className="text-slate-400 text-sm">
                            Manage your technical projects. These help Radiance tailor
                            your CV for each job.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-blue-900/30 shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        Add project
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl border border-red-500/30 bg-red-500/5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={i}
                                className="rounded-2xl border border-white/8 bg-white/2 p-5 h-32 animate-pulse"
                            />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && projects.length === 0 && !error && (
                    <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
                        <div className="p-4 rounded-2xl bg-white/3 border border-white/8 mb-4">
                            <FolderOpen className="w-8 h-8 text-slate-600" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-400 mb-1">
                            No projects yet
                        </h3>
                        <p className="text-sm text-slate-600 max-w-xs">
                            Add your first project to help Radiance create more targeted
                            CV enhancements.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="mt-5 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:text-white hover:bg-white/5 transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Add your first project
                        </button>
                    </div>
                )}

                {/* Project grid */}
                {!loading && projects.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in duration-500">
                        {projects.map((project) => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                onDelete={handleDeleted}
                            />
                        ))}
                    </div>
                )}
            </div>
        </>
    )
}
