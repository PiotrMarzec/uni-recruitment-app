import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Allow access from local network devices (phones, other machines) during dev
  allowedDevOrigins: ["192.168.0.*", "192.168.1.*", "10.0.0.*"],
  // Don't use standalone for Docker — we run with custom server + tsx
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
    ],
  },
  webpack: (config) => {
    // Fix for @react-pdf/renderer
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: { browser: "./empty-module.js" },
      // next-intl plugin writes to experimental.turbo which Next 15.5+ ignores;
      // explicitly alias next-intl/config here so Turbopack can resolve it.
      "next-intl/config": "./src/i18n/request.ts",
    },
  },
};

export default withNextIntl(nextConfig);
