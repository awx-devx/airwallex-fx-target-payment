import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The production web image copies `.next/standalone` (docs/10).
  output: 'standalone',
  // This repo already has AGENTS.md. Don't let `next dev` append a block to it.
  agentRules: false,
  // Playwright and the browser use 127.0.0.1; dev HMR is otherwise blocked.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
