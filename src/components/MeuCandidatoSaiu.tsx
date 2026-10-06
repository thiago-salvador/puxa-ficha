"use client"

// cspell:ignore aliancas opcao

import { useId, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { DadosMeuCandidato } from "@/lib/aliancas-2turno"
import { FonteDeclaracao } from "@/components/FonteDeclaracao"

/**
 * "Votou em quem saiu?": um seletor nativo (teclado e leitor de tela de graça)
 * com os eliminados a Presidente e a governador nos estados com 2º turno. O
 * resultado aparece só depois da escolha, numa região que anuncia a mudança.
 * Os dados chegam prontos do servidor; nada é buscado aqui.
 */
export function MeuCandidatoSaiu({ dados }: { dados: DadosMeuCandidato }) {
  const id = useId()
  const [escolha, setEscolha] = useState("")
  const opcao = dados.opcoes.find((o) => o.id === escolha) ?? null
  const grupos = [...new Set(dados.opcoes.map((o) => o.grupo))]
  return (
    <div className="rounded-[12px] border border-border p-4 sm:p-5" data-pf-meu-candidato-saiu>
      <label htmlFor={id} className="block text-[length:var(--text-body-sm)] font-bold text-foreground">
        Votou em quem saiu? Escolha o candidato
      </label>
      <select
        id={id}
        value={escolha}
        onChange={(e) => setEscolha(e.target.value)}
        className="mt-2 block min-h-11 w-full max-w-md rounded-[8px] border border-border bg-background px-3 text-[length:var(--text-body-sm)] font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <option value="">Escolha um candidato</option>
        {grupos.map((grupo) => (
          <optgroup key={grupo} label={grupo}>
            {dados.opcoes
              .filter((o) => o.grupo === grupo)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome} ({o.partido})
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <div aria-live="polite" data-pf-meu-candidato-resultado>
        {opcao && (
          <div className="mt-4 space-y-2 text-[length:var(--text-body-sm)] font-medium text-foreground">
            <p>
              <span className="font-bold">{opcao.nome}</span> ({opcao.partido}, {opcao.grupo}) teve{" "}
              <span className="font-bold tabular-nums">{opcao.percentual}</span> dos válidos no 1º turno,{" "}
              <span className="tabular-nums">{opcao.votos}</span> votos.
            </p>
            <div>
              <p>
                Posição no 2º turno: <span className="font-bold">{opcao.posicao.rotulo}</span>
                {opcao.posicao.declarada ? "." : ""}
              </p>
              {opcao.posicao.fonte && <FonteDeclaracao fonte={opcao.posicao.fonte} data={opcao.posicao.data} />}
            </div>
            <p>{opcao.confronto.rotulo}</p>
            <p className="flex flex-wrap items-center gap-x-4">
              <Link
                href={opcao.confronto.href}
                className="inline-flex min-h-11 items-center gap-1 font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"
              >
                {opcao.confronto.hrefRotulo} <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              {opcao.finalistas.map((f) =>
                f.slug ? (
                  <Link
                    key={f.slug}
                    href={`/candidato/${f.slug}`}
                    className="inline-flex min-h-11 items-center gap-1 font-bold underline underline-offset-4 hover:text-[var(--gray-600)]"
                  >
                    Ficha completa de {f.nome} <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : null,
              )}
            </p>
            <p className="text-[length:var(--text-caption)] text-muted-foreground">Declaração de apoio não transfere votos.</p>
          </div>
        )}
      </div>
    </div>
  )
}
