import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Don't use standalone for Docker — we run with custom server + tsx
  webpack: (config) => {
    // Fix for @react-pdf/renderer
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default withNextIntl(nextConfig);
