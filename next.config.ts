import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/**",
      },
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
};

export default nextConfig;
