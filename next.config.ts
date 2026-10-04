import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The production web image copies `.next/standalone` (docs/10).
  output: 'standalone',
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'zxing-wasm'],
  // This repo already has AGENTS.md. Don't let `next dev` append a block to it.
  agentRules: false,
  // Cross-origin hosts that may hit the dev server (HMR, RSC, assets).
  // Playwright uses 127.0.0.1; quick tunnels use *.trycloudflare.com.
  allowedDevOrigins: ['127.0.0.1', '*.trycloudflare.com'],
};

export default nextConfig;
