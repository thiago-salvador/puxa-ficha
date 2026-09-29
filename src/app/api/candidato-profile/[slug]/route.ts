import { createCandidatoProfileGetHandler } from "@/lib/candidato-profile-route"

// A função roda a cada cache miss; a resposta viva vai para o CDN com a tag
// `public-candidato-ficha` (ver candidato-profile-route.ts), apagada pelo POST
// /api/revalidate junto com o `unstable_cache`. O rate limit fica na fábrica.
export const dynamic = "force-dynamic"

export const GET = createCandidatoProfileGetHandler()
