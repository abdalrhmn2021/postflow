import type { NextConfig } from "next";

// Where the NestJS API runs (no /api at the end).
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Security headers on every page of the site (the API sets its own with helmet, so /api/* is left out).
//   frame-ancestors / X-Frame-Options: no other site can show our pages inside an <iframe>. Without it,
//     a page could put the client's review page under a fake button and make them click "Approve"
//     without knowing (clickjacking).
//   Referrer-Policy same-origin: the full address (with an invite's or a review link's secret in it)
//     is never sent to another site - not to Cloudinary's images, not to a link the person clicks.
//   HSTS: the browser only ever opens the site over HTTPS (ignored on http://localhost).
//   nosniff: a file is only ever treated as what its Content-Type says.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" }, // the same, for old browsers
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // no "X-Powered-By: Next.js": no need to tell anyone what the site runs on
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser only ever talks to this site: /api/* is forwarded to the API.
  // Same idea as BookFlow - the login cookie (phase 1) stays first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/", headers: securityHeaders },
      { source: "/:path((?!api/).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
