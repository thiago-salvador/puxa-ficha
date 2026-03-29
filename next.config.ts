import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/**",
      },
      {
        protocol: "https",
        hostname: "divulgacandcontas.tse.jus.br",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
