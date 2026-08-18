import type { MetadataRoute } from "next"

export const PREVIEW_NOINDEX_HEADER_VALUE = "noindex, nofollow, noarchive"
export const EMBED_NOINDEX_HEADER_VALUE = "noindex, nofollow"

const PUBLIC_ROBOTS_DISALLOW = ["/styleguide", "/internaltest", "/preview", "/api/", "/embed/"]

function isVercelPreviewDeployment(
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): boolean {
  return vercelEnv === "preview"
}

export function getEmbedNoindexHeaderValue(
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): string {
  return isVercelPreviewDeployment(vercelEnv)
    ? PREVIEW_NOINDEX_HEADER_VALUE
    : EMBED_NOINDEX_HEADER_VALUE
}

export function getPreviewMetadataRobots(
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): { index: false; follow: false } | undefined {
  return isVercelPreviewDeployment(vercelEnv)
    ? {
        index: false,
        follow: false,
      }
    : undefined
}

export function buildRobotsForDeployment(
  vercelEnv: string | undefined = process.env.VERCEL_ENV
): MetadataRoute.Robots {
  if (isVercelPreviewDeployment(vercelEnv)) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
    }
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PUBLIC_ROBOTS_DISALLOW,
      },
    ],
    sitemap: "https://puxaficha.com.br/sitemap.xml",
  }
}
