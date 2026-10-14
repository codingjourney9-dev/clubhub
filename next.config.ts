import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Dev-only. Next.js blocks cross-origin requests to the dev server unless the
  // requesting host is listed here. The sandbox preview is proxied through
  // `*.e2b.app`, so it must be allowed or the preview will not hydrate.
  // This setting is ignored by production builds (`next build` / `next start`).
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],

  async headers() {
    return [
      {
        // NOTE: deliberately no X-Frame-Options / frame-ancestors here — the
        // workspace preview renders the app inside a sandboxed iframe.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
