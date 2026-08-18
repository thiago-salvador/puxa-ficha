import { buildSiteManifest } from "@/lib/site-manifest"

export function GET() {
  return Response.json(buildSiteManifest(), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  })
}
