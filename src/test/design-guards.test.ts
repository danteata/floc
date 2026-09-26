import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards for the visual system. Tailwind v4 compiles an unknown or off-system
 * class without complaint, which is how the app drifted to ~500 raw palette
 * classes and a hard-coded purple on half its headers. These tests make that
 * drift fail loudly instead.
 */

const ROOT = join(__dirname, '..', '..')

/** The landing page is designed light-only with its own neutral scale. */
const EXEMPT = new Set(['src/pages/Home.tsx'])

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path)
        return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : []
    })
}

const FILES = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'components'))]
    .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }))
    .filter(({ path }) => !EXEMPT.has(path))

const PALETTE =
    /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|from|to|via|ring|fill|stroke|divide|outline)(?:-[trblxy])?-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?(?![\w-])/g

const HEX_CLASS = /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g

function offenders(pattern: RegExp): string[] {
    return FILES.flatMap(({ path, text }) =>
        [...text.matchAll(pattern)].map((m) => `${path}: ${m[0]}`),
    )
}

describe('the visual system', () => {
    it('uses theme colours, not raw Tailwind palette classes', () => {
        // Use the tokens instead: primary, success, warning, info, destructive
        // (and their -strong shades for text), muted, foreground, border.
        expect(offenders(PALETTE)).toEqual([])
    })

    it('uses theme colours, not hard-coded hex classes', () => {
        expect(offenders(HEX_CLASS)).toEqual([])
    })
})
