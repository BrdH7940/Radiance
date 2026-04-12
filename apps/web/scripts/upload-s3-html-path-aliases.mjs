#!/usr/bin/env node
/**
 * Next.js static export (v14) emits routes as `out/login.html`, `out/dashboard.html`,
 * `out/dashboard/gallery.html`, etc. S3 REST + CloudFront maps GET /dashboard to object
 * key `dashboard`, not `dashboard.html`, so the origin 404s and the distribution's
 * custom error response serves root index.html — wrong route, infinite spinner on reload.
 *
 * After `aws s3 sync out/`, this script uploads each route HTML file again under a
 * second key: strip the `.html` suffix so GET /dashboard receives the correct document.
 *
 * Env:
 *   FRONTEND_BUCKET (required) — target bucket
 *   OUT_DIR (optional) — default ./out relative to cwd
 *   DRY_RUN=1 — print actions only
 */

import { readdir } from 'fs/promises'
import path from 'path'
import { execFileSync } from 'child_process'

const bucket = process.env.FRONTEND_BUCKET
const outDir = path.resolve(process.cwd(), process.env.OUT_DIR || 'out')
const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

if (!bucket) {
  console.error('upload-s3-html-path-aliases: set FRONTEND_BUCKET')
  process.exit(1)
}

/** @returns {AsyncGenerator<string>} */
async function* walkHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '_next') continue
      yield* walkHtmlFiles(full)
    } else if (e.name.endsWith('.html')) {
      if (e.name === '404.html') continue
      yield full
    }
  }
}

function toS3Key(outRoot, htmlPath) {
  const rel = path.relative(outRoot, htmlPath).split(path.sep).join('/')
  if (rel === 'index.html') return null
  return rel.replace(/\.html$/i, '')
}

let count = 0
for await (const htmlPath of walkHtmlFiles(outDir)) {
  const key = toS3Key(outDir, htmlPath)
  if (!key) continue

  const dest = `s3://${bucket}/${key}`
  if (dry) {
    console.log(`[dry-run] ${htmlPath} -> ${dest}`)
  } else {
    execFileSync(
      'aws',
      [
        's3',
        'cp',
        htmlPath,
        dest,
        '--content-type',
        'text/html; charset=utf-8',
        '--cache-control',
        'public, max-age=0, must-revalidate',
      ],
      { stdio: 'inherit' }
    )
  }
  count += 1
}

console.log(`upload-s3-html-path-aliases: ${dry ? 'would upload' : 'uploaded'} ${count} object(s)`)
