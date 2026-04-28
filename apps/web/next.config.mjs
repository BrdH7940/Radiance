/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Required for WebGPU and high-performance SharedArrayBuffer in WebWorkers.
  // NOTE: `headers()` is ignored in static export mode (`output: 'export'`).
  // For production, set COOP/COEP via CloudFront Functions (see infra/main.tf).
  // This config applies during `next dev` and any server-rendered deployment.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },
}

export default nextConfig
