import { createCandidatoSlugsGetHandler } from "@/lib/candidato-slugs-route"

/**
 * Retorna a lista de slugs publicos validos, para que o middleware possa
 * emitir HTTP 404 real em `/candidato/[slug]` inexistente antes do page body
 * commitar status 200 via streaming/Suspense (soft-404 do App Router).
 *
 * A implementação do handler fica em lib para que o arquivo de rota exporte
 * apenas a superfície permitida pelo App Router.
 */
export const dynamic = "force-dynamic"

export const GET = createCandidatoSlugsGetHandler()
