import Link from "next/link"
import { sanitizeFontePublica } from "@/lib/observacao-publica"
import type { FichaCandidato } from "@/lib/types"
import { formatDate } from "@/lib/utils"
import { CandidatePhotoCredit } from "@/components/CandidatePhotoCredit"

export function ProfileSourceFooter({
  ficha,
}: {
  ficha: Pick<FichaCandidato, "fonte_dados" | "ultima_atualizacao" | "foto_credito">
}) {
  // Este rodapé é server-renderizado a partir da `FichaCandidato` CRUA, e não do
  // DTO público: a limpeza do DTO não passa por aqui. Era por isso que o HTML
  // servido do amelio-cayres trazia "DivulgaCandContas 2022 id 270001654140",
  // no texto e no atributo `data-pf-profile-sources`. Sanitizar entrada por
  // entrada, antes de juntar, cobre os dois de uma vez.
  const profileSources =
    (ficha.fonte_dados ?? [])
      .map((fonte) => sanitizeFontePublica(fonte) ?? "")
      .filter((fonte) => fonte.trim() !== "")
      .join(", ") || "TSE"

  return (
    <aside
      className="mx-auto max-w-7xl px-5 py-5 md:px-12"
      aria-label="Fontes e aviso legal da ficha"
      data-pf-profile-server-disclosure=""
    >
      <p
        className="break-words text-[length:var(--text-eyebrow)] font-semibold text-muted-foreground [overflow-wrap:anywhere]"
        data-pf-profile-source-footer=""
        data-pf-profile-sources={profileSources}
        data-pf-profile-updated-at={ficha.ultima_atualizacao}
      >
        Fontes: {profileSources}. Atualizado em {formatDate(ficha.ultima_atualizacao)}. Consulte a{" "}
        <Link className="underline" href="/metodologia">
          metodologia
        </Link>
        .
      </p>
      <CandidatePhotoCredit credit={ficha.foto_credito} variant="footer" />
      <p
        className="mt-2 max-w-3xl text-[length:var(--text-eyebrow)] leading-relaxed text-muted-foreground"
        data-pf-profile-legal-disclaimer=""
      >
        Dados públicos sobre candidato mapeado para 2026. Não é recomendação de voto.
        Investigações sem condenação não implicam culpa. Para correção, escreva para{" "}
        <a
          className="underline"
          href="mailto:contato@puxaficha.com.br?subject=Retificação de ficha"
        >
          contato@puxaficha.com.br
        </a>{" "}
        com o assunto Retificação de ficha.
      </p>
    </aside>
  )
}
