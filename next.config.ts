import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"
import { REMOTE_IMAGE_HOSTS } from "./src/lib/remote-image-hosts"
import { getEmbedNoindexHeaderValue } from "./src/lib/preview-indexing"
import ondaPRedirects from "./src/data/redirects-onda-p.json"

const isDevelopment = process.env.NODE_ENV !== "production"
const apexHost = "puxaficha.com.br"
const wwwHost = "www.puxaficha.com.br"
const htmlLimitedBots =
  /[\w-]+-Google|Google-[\w-]+|Chrome\/\d+|Chrome-Lighthouse|HeadlessChrome|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i

/**
 * `npm run start` usa NODE_ENV=production sem VERCEL. `upgrade-insecure-requests` + HSTS em HTTP local
 * quebram assets no WebKit (ex.: Playwright mobile). Na Vercel, VERCEL=1 e o site e HTTPS.
 * Host proprio com HTTPS pode forcar: PF_FORCE_PRODUCTION_SECURITY_HEADERS=1.
 */
const applyProductionHttpsHeaders =
  process.env.VERCEL === "1" || process.env.PF_FORCE_PRODUCTION_SECURITY_HEADERS === "1"

function getSupabaseHostname() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || supabaseUrl.includes("placeholder")) return null

  try {
    return new URL(supabaseUrl).hostname
  } catch {
    return null
  }
}

const supabaseHostname = getSupabaseHostname()

const sharedSecurityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDevelopment || !applyProductionHttpsHeaders
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
]

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  ...sharedSecurityHeaders,
]

/** Iframe em sites terceiros: sem XFO; CSP dinamico no middleware com frame-ancestors *. */
const embedFramingHeaders = [
  { key: "X-Robots-Tag", value: getEmbedNoindexHeaderValue() },
  ...sharedSecurityHeaders,
]

export const puxaFichaNextConfig: NextConfig = {
  poweredByHeader: false,
  // Páginas públicas pesadas de UF/rankings podem exceder o default de 60s
  // durante static generation no Vercel, mesmo com build local verde.
  staticPageGenerationTimeout: 180,
  // Mantem metadata critica no HTML inicial para crawlers e para o UA Chrome usado pelo Lighthouse.
  htmlLimitedBots,
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: wwwHost }],
        destination: `https://${apexHost}/:path*`,
        permanent: true,
      },
      {
        source: "/alertas",
        destination: "/alertas/gerenciar",
        permanent: true,
      },
      ...ondaPRedirects,
      {
        source: "/governadores/:uf([a-z]{2})",
        destination: "/uf/:uf",
        permanent: true,
      },
      {
        source: "/governadores/:uf([a-z]{2})/:path*",
        destination: "/uf/:uf/:path*",
        permanent: true,
      },
    ]
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    // Assets visuais do site (fotos de candidatos, logos de partido, heros, imagens de ministério)
    // raramente mudam. Cache TTL longo elimina re-transformação no expirar (era 60s default),
    // que inflava writes no pipeline do Vercel. deviceSizes/imageSizes reduzidos cortam a matriz
    // de variações geradas por imagem. formats limitado a webp mantém compatibilidade ampla.
    minimumCacheTTL: 31536000,
    deviceSizes: [640, 828, 1200, 1920],
    imageSizes: [64, 128, 256, 384],
    formats: ["image/webp"],
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/**",
            },
          ]
        : []),
      ...REMOTE_IMAGE_HOSTS.flatMap((hostname) => {
        const protocols: Array<"https" | "http"> =
          hostname === "www.senado.leg.br" ? ["https", "http"] : ["https"]

        return protocols.map((protocol) => ({
          protocol,
          hostname,
          pathname: "/**",
        }))
      }),
    ],
  },
  async headers() {
    return [
      // ":path+" (um ou mais segmentos) casa so o widget /embed/[slug]. Com ":path*"
      // a rota nua /embed, que e a pagina publica geradora do codigo de embed,
      // tambem recebia noindex e ficava fora do indice sem necessidade.
      {
        source: "/embed/:path+",
        headers: embedFramingHeaders,
      },
      // Espelha a regra acima: so o widget fica de fora dos headers padrao do site.
      // A pagina nua /embed volta a receber securityHeaders e a ser indexavel.
      {
        source: "/((?!embed/).*)",
        headers: securityHeaders,
      },
      {
        source: "/preview/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(puxaFichaNextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
    filesToDeleteAfterUpload: [".next/static/**/*.map", ".next/server/**/*.map"],
  },
})
