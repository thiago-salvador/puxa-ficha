import type { MetadataRoute } from "next"
import { buildRobotsForDeployment } from "@/lib/preview-indexing"

export default function robots(): MetadataRoute.Robots {
  return buildRobotsForDeployment()
}
