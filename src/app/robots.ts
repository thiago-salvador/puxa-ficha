import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/styleguide", "/api/"],
      },
    ],
    sitemap: "https://puxaficha.com.br/sitemap.xml",
  }
}
