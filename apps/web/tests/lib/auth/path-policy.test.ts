import { describe, it, expect } from 'vitest'
import { isProtectedPath } from '@/lib/auth/path-policy'

describe('isProtectedPath', () => {
    describe('/dashboard prefix', () => {
        it('matches exact /dashboard', () => {
            expect(isProtectedPath('/dashboard')).toBe(true)
        })

        it('matches /dashboard/ sub-path', () => {
            expect(isProtectedPath('/dashboard/history')).toBe(true)
        })

        it('matches deeply nested /dashboard path', () => {
            expect(isProtectedPath('/dashboard/gallery/123')).toBe(true)
        })

        it('does NOT match /dashboard-admin (different prefix)', () => {
            expect(isProtectedPath('/dashboard-admin')).toBe(false)
        })

        it('does NOT match /dashboards (prefix with trailing char)', () => {
            expect(isProtectedPath('/dashboards')).toBe(false)
        })
    })

    describe('/workspace prefix', () => {
        it('matches exact /workspace', () => {
            expect(isProtectedPath('/workspace')).toBe(true)
        })

        it('matches /workspace/ sub-path', () => {
            expect(isProtectedPath('/workspace/edit')).toBe(true)
        })

        it('does NOT match /workspaces', () => {
            expect(isProtectedPath('/workspaces')).toBe(false)
        })
    })

    describe('public paths — must NOT be protected', () => {
        it('does NOT protect root /', () => {
            expect(isProtectedPath('/')).toBe(false)
        })

        it('does NOT protect /login', () => {
            expect(isProtectedPath('/login')).toBe(false)
        })

        it('does NOT protect /auth/callback', () => {
            expect(isProtectedPath('/auth/callback')).toBe(false)
        })

        it('does NOT protect empty string', () => {
            expect(isProtectedPath('')).toBe(false)
        })
    })
})
