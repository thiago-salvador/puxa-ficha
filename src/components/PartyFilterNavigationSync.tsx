"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { readPartyFilterFromSearchParams } from "@/lib/party-filter-url"

/** Mantém filtros de layouts persistentes em sincronia com navegação do App Router. */
export function PartyFilterNavigationSync({ onChange }: { onChange: (party: string) => void }) {
  const searchParams = useSearchParams()
  const serialized = searchParams?.toString() ?? ""

  useEffect(() => {
    onChange(readPartyFilterFromSearchParams(serialized))
  }, [onChange, serialized])

  return null
}
