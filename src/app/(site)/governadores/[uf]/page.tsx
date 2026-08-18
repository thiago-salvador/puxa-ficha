import { permanentRedirect } from "next/navigation"

export default async function GovernadorUfLegacyRedirect({
  params,
}: {
  params: Promise<{ uf: string }>
}) {
  const { uf } = await params
  permanentRedirect(`/uf/${uf.toLowerCase()}`)
}
