import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'zxing-wasm'],
  // This repo already has AGENTS.md. Don't let `next dev` append a block to it.
  agentRules: false,
  // Cross-origin hosts that may hit the dev server (HMR, RSC, assets).
  // Playwright uses 127.0.0.1; quick tunnels use *.trycloudflare.com.
  // Replit's editor preview is *.replit.dev; the published host is *.replit.app.
  allowedDevOrigins: ['127.0.0.1', '*.trycloudflare.com', '*.replit.dev', '*.replit.app'],
};

export default nextConfig;
