import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/styleguide", "/internaltest", "/api/"],
      },
    ],
    sitemap: "https://puxaficha.com.br/sitemap.xml",
  }
}
