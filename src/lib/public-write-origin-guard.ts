import { NextResponse } from "next/server"
import {
  getCrossSiteWriteBlockReason,
  type CrossSiteWriteGuardOptions,
} from "@/lib/cross-site-write-guard"

type HeadersLike = Pick<Headers, "get">

interface PublicWriteRequestLike {
  url: string
  headers: HeadersLike
}

export function rejectCrossSitePublicWrite(
  req: PublicWriteRequestLike,
  options: CrossSiteWriteGuardOptions = {},
): NextResponse | null {
  const reason = getCrossSiteWriteBlockReason(
    req.headers,
    new URL(req.url).origin,
    options,
  )
  if (!reason) return null

  return NextResponse.json(
    { error: "Cross-site request blocked" },
    {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "x-pf-block-reason": reason,
      },
    },
  )
}
