import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: static shell + 'use cache' for the catalogue, Suspense for per-user data.
  cacheComponents: true,
  partialPrefetching: true,
  // Native renderer (Rust) must not be bundled; it is loaded from node_modules at runtime.
  serverExternalPackages: ["@resvg/resvg-js"],
  // The print engine reads the TTF files from disk on the server; ship them with every function.
  outputFileTracingIncludes: { "/**": ["./public/fonts/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        // No other site may frame these pages (clickjacking); no plugins; base URL fixed.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
