import { createCandidatoProfileGetHandler } from "@/lib/candidato-profile-route"

// Estado pos-PF-04: o HTML da ficha e esta API sao dinamicos e private/no-store.
// Nao ha ISR nem defesa de CDN neste caminho. A unica camada persistente e o
// `unstable_cache` de dados em getCandidatoBySlugResource, invalidado pela tag
// `public-candidato-ficha`; o rate limit fica na fábrica do handler.
export const dynamic = "force-dynamic"

export const GET = createCandidatoProfileGetHandler()
