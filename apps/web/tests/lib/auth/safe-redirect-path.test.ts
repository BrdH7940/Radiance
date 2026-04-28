import { describe, it, expect } from 'vitest'
import { sanitizeNextPath } from '@/lib/auth/safe-redirect-path'

describe('sanitizeNextPath', () => {
    const FALLBACK = '/dashboard'

    describe('valid paths — returns the path as-is', () => {
        it('returns a simple absolute path', () => {
            expect(sanitizeNextPath('/dashboard', FALLBACK)).toBe('/dashboard')
        })

        it('returns a nested absolute path', () => {
            expect(sanitizeNextPath('/dashboard/history', FALLBACK)).toBe('/dashboard/history')
        })

        it('returns a path with query string', () => {
            expect(sanitizeNextPath('/workspace?tab=editor', FALLBACK)).toBe('/workspace?tab=editor')
        })

        it('returns a path with hash fragment', () => {
            expect(sanitizeNextPath('/dashboard#section', FALLBACK)).toBe('/dashboard#section')
        })
    })

    describe('open-redirect attempts — returns fallback', () => {
        it('blocks protocol-relative URL (//evil.com)', () => {
            expect(sanitizeNextPath('//evil.com', FALLBACK)).toBe(FALLBACK)
        })

        it('blocks http:// absolute URL', () => {
            expect(sanitizeNextPath('http://evil.com/steal', FALLBACK)).toBe(FALLBACK)
        })

        it('blocks https:// absolute URL', () => {
            expect(sanitizeNextPath('https://evil.com', FALLBACK)).toBe(FALLBACK)
        })

        it('blocks javascript: URI', () => {
            expect(sanitizeNextPath('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
        })

        it('blocks empty string', () => {
            expect(sanitizeNextPath('', FALLBACK)).toBe(FALLBACK)
        })

        it('blocks relative path without leading slash', () => {
            expect(sanitizeNextPath('dashboard', FALLBACK)).toBe(FALLBACK)
        })
    })

    describe('null / undefined input — returns fallback', () => {
        it('returns fallback for null', () => {
            expect(sanitizeNextPath(null, FALLBACK)).toBe(FALLBACK)
        })

        it('returns fallback for undefined', () => {
            expect(sanitizeNextPath(undefined, FALLBACK)).toBe(FALLBACK)
        })
    })

    describe('custom fallbacks', () => {
        it('uses the provided fallback string', () => {
            expect(sanitizeNextPath(null, '/login')).toBe('/login')
        })

        it('uses fallback for invalid path regardless of its value', () => {
            expect(sanitizeNextPath('//x', '/home')).toBe('/home')
        })
    })
})
