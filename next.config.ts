import type { NextConfig } from "next"

const REMOTE_IMAGE_HOSTS = [
  "adrianannogueira.com.br",
  "boavista.rr.gov.br",
  "cdn.jd1noticias.com",
  "cdn.olivre.com.br",
  "cdn2.tribunaonline.com.br",
  "cidadesemfoco.com",
  "divulgacandcontas.tse.jus.br",
  "eleicoes2024candidatosapi.otempo.com.br",
  "gabriel15.com.br",
  "marcozero.org",
  "memoriapolitica.alesc.sc.gov.br",
  "opoti.com.br",
  "paraiba.pb.gov.br",
  "pmt.pi.gov.br",
  "pt.org.br",
  "republicanos10.org.br",
  "sapl.al.ro.leg.br",
  "sapl.riobranco.ac.leg.br",
  "static.ndmais.com.br",
  "storage.al.mt.gov.br",
  "upload.wikimedia.org",
  "uploads.folhabv.com.br",
  "www.ananindeua.pa.gov.br",
  "www.bahianoticias.com.br",
  "www.camara.leg.br",
  "www.senado.leg.br",
]

const isDevelopment = process.env.NODE_ENV !== "production"

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

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https:`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss: ws:",
  "media-src 'self' data: blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment || !applyProductionHttpsHeaders ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
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
      {
        source: "/:path*",
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

export default nextConfig
