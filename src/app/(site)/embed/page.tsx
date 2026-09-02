import type { Metadata } from "next"
import { getCandidatosResource } from "@/lib/api"
import { EmbedCodeGenerator } from "@/components/EmbedCodeGenerator"

export const metadata: Metadata = {
  title: "Widget embed | Puxa Ficha",
  description: "Gere o código HTML para incorporar o resumo de um candidato no seu site.",
  // Sem isto a página herda o canonical "/" do layout do site e aponta para a home.
  alternates: { canonical: "/embed" },
  robots: { index: true, follow: true },
}

export default async function EmbedGeneratorPage() {
  const resource = await getCandidatosResource()
  const list = resource.data

  if (resource.sourceStatus !== "live" || list.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="font-heading text-[32px] uppercase text-foreground">Widget embed</h1>
        <p className="mt-4 text-[15px] text-muted-foreground">
          Não foi possível carregar a lista de candidatos agora. Tente novamente em instantes.
        </p>
        {resource.sourceMessage ? (
          <p className="mt-2 text-[length:var(--text-body-sm)] text-muted-foreground">{resource.sourceMessage}</p>
        ) : null}
      </div>
    )
  }

  const candidates = [...list]
    .sort((a, b) => a.nome_urna.localeCompare(b.nome_urna, "pt-BR"))
    // Sanitizacao publica de partido_sigla ja acontece no resource central
    // (src/lib/api.ts via sanitizePublicPartyFields); o mapping pontual que
    // existia aqui ate o Bloco 1 foi removido.
    .map((c) => ({
      slug: c.slug,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
    }))

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-12">
      <h1 className="font-heading text-[40px] uppercase leading-none tracking-tight text-foreground">
        Widget embed
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Copie o código do iframe para exibir um resumo público do candidato. A página canônica no
        Puxa Ficha reúne mais contexto, fontes e atualizações disponíveis.
      </p>
      <div className="mt-10">
        <EmbedCodeGenerator candidates={candidates} />
      </div>
    </div>
  )
}
