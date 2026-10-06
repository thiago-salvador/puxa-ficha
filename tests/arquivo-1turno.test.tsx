/**
 * Arquivo do 1º turno (/1o-turno): a home como estava até a votação, com a foto
 * em preto e branco de quem não segue na disputa. A fase vem do snapshot do TSE
 * (`src/data/resultados-1turno-2026.json`) mesclado à fase do banco.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { CandidatoCard } from "@/components/CandidatoCard"
import { CandidatoGrid } from "@/components/CandidatoGrid"
import { GlobalSearchProvider } from "@/components/GlobalSearchProvider"
import { FOTO_PB_DICA, fotoEmPretoEBranco } from "@/lib/arquivo-1turno"
import { slugsComFotoPretoEBranco } from "@/lib/finalistas-1turno"
import type { Candidato, FaseEleitoral2026 } from "@/lib/types"

const fase = (fase_eleitoral: FaseEleitoral2026["fase_eleitoral"]): FaseEleitoral2026 => ({
  fase_eleitoral,
  fase_turno: 1,
  atualizacao_encerrada_em: null,
})

const candidato = (slug: string, nome: string, cargo = "Presidente", foto_url: string | null = null): Candidato =>
  ({
    id: `id-${slug}`,
    slug,
    nome_urna: nome,
    nome_completo: nome,
    partido_sigla: "PX",
    partido_atual: "PX",
    foto_url,
    cargo_disputado: cargo,
    estado: cargo === "Presidente" ? null : "BA",
    redes_sociais: {},
  }) as unknown as Candidato

const router = {
  push: () => {},
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
}

describe("fotoEmPretoEBranco", () => {
  it("só quem perdeu fica em preto e branco", () => {
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: fase("nao_eleito") }), true)
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: fase("fora_da_disputa") }), true)
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: fase("eleito") }), false)
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: fase("segundo_turno") }), false)
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: fase("em_disputa") }), false)
    assert.equal(fotoEmPretoEBranco({ fase_eleitoral_2026: null }), false)
    assert.equal(fotoEmPretoEBranco({}), false)
  })
})

describe("slugsComFotoPretoEBranco (fase efetiva: banco + snapshot do TSE)", () => {
  it("perdedor do snapshot em PB; finalistas, governador eleito e quem não está no snapshot em cor", () => {
    const candidatos = [
      candidato("augusto-cury", "Augusto Cury"),
      candidato("lula", "Lula"),
      candidato("flavio-bolsonaro", "Flávio Bolsonaro"),
      candidato("jeronimo", "Jerônimo", "Governador"),
      candidato("fixture-sem-resultado", "Sem Resultado"),
    ]
    assert.deepEqual(slugsComFotoPretoEBranco(candidatos, new Map()), ["augusto-cury"])
  })

  it("linha em_disputa do banco não apaga o resultado do snapshot; fase do banco já resolvida vence", () => {
    const candidatos = [candidato("augusto-cury", "Augusto Cury"), candidato("fixture-sem-resultado", "Sem Resultado")]
    const fasePorSlug = new Map([
      ["augusto-cury", fase("em_disputa")],
      ["fixture-sem-resultado", fase("fora_da_disputa")],
    ])
    assert.deepEqual(slugsComFotoPretoEBranco(candidatos, fasePorSlug), ["augusto-cury", "fixture-sem-resultado"])
  })

  it("fora do resultado por renúncia ou indeferimento fica em PB; registro deferido sem resultado continua em cor", () => {
    const renuncia = { ...candidato("fixture-renuncia", "Renunciou"), situacao_candidatura: "Renúncia" }
    const indeferido = { ...candidato("fixture-indeferido", "Indeferido"), situacao_candidatura: "Indeferido com recurso" }
    const deferido = { ...candidato("fixture-deferido", "Deferido"), situacao_candidatura: "Deferido" }
    const finalistaIrregular = { ...candidato("lula", "Lula"), situacao_candidatura: "Indeferido com recurso" }
    assert.deepEqual(slugsComFotoPretoEBranco([renuncia, indeferido, deferido, finalistaIrregular], new Map()), ["fixture-renuncia", "fixture-indeferido"])
  })

  it("a fase efetiva (snapshot) vence a que veio no objeto do candidato", () => {
    const comFaseNoObjeto = { ...candidato("lula", "Lula"), fase_eleitoral_2026: fase("nao_eleito") }
    assert.deepEqual(slugsComFotoPretoEBranco([comFaseNoObjeto], new Map()), [])
  })
})

describe("grade do arquivo", () => {
  const candidatos = [candidato("augusto-cury", "Augusto Cury"), candidato("lula", "Lula"), candidato("flavio-bolsonaro", "Flávio Bolsonaro")]
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router as never}>
      <GlobalSearchProvider>
        <CandidatoGrid
          candidatos={candidatos}
          processos={{}}
          patrimonios={{ "augusto-cury": null, lula: null, "flavio-bolsonaro": null }}
          slugsFotoPB={slugsComFotoPretoEBranco(candidatos, new Map())}
        />
      </GlobalSearchProvider>
    </AppRouterContext.Provider>,
  )
  const cards = new Map(
    [...html.matchAll(/<a[^>]*href="\/candidato\/([^"]+)"[\s\S]*?<\/a>/g)].map((match) => [match[1], match[0]]),
  )

  it("todos os cards seguem com link para a ficha", () => {
    assert.deepEqual([...cards.keys()].sort(), ["augusto-cury", "flavio-bolsonaro", "lula"])
  })

  it("só o perdedor tem a foto marcada e a dica para leitor de tela", () => {
    assert.match(cards.get("augusto-cury") ?? "", /data-pf-foto-pb=""/)
    assert.match(cards.get("augusto-cury") ?? "", new RegExp(`<span class="sr-only">, ${FOTO_PB_DICA}</span>`))
    for (const slug of ["lula", "flavio-bolsonaro"]) {
      assert.doesNotMatch(cards.get(slug) ?? "", /data-pf-foto-pb/)
      assert.doesNotMatch(cards.get(slug) ?? "", new RegExp(FOTO_PB_DICA))
    }
  })

  it("sem slugsFotoPB (demais páginas) nada muda", () => {
    const semPB = renderToStaticMarkup(
      <AppRouterContext.Provider value={router as never}>
        <GlobalSearchProvider>
          <CandidatoGrid candidatos={candidatos} processos={{}} patrimonios={{}} />
        </GlobalSearchProvider>
      </AppRouterContext.Provider>,
    )
    assert.doesNotMatch(semPB, /data-pf-foto-pb|grayscale/)
  })
})

describe("card com foto em PB", () => {
  it("grayscale só na foto; nome e texto continuam fora do filtro", () => {
    const html = renderToStaticMarkup(
      <CandidatoCard candidato={candidato("augusto-cury", "Augusto Cury", "Presidente", "/images/candidatos/augusto-cury.jpg")} processos={0} patrimonio={null} index={0} fotoPB />,
    )
    const imgs = [...html.matchAll(/<img[^>]*>/g)].map((match) => match[0])
    const foto = imgs.find((tag) => tag.includes('alt="Foto de Augusto Cury"'))
    assert.ok(foto, "a foto do candidato é renderizada")
    assert.match(foto, /class="[^"]*\bgrayscale\b/)
    assert.equal(html.match(/\bgrayscale\b/g)?.length, 1)
    assert.match(html, /href="\/candidato\/augusto-cury"/)
  })
})

describe("composição de /1o-turno", () => {
  const pagina = readFileSync("src/app/(site)/1o-turno/page.tsx", "utf8")

  it("título, canonical e nota do arquivo", () => {
    assert.match(pagina, /title = "Arquivo do 1º turno das eleições 2026 \| Puxa Ficha"/)
    assert.match(pagina, /canonical: "\/1o-turno"/)
    assert.match(pagina, /Arquivo do 1º turno:<\/strong> o site como estava até a votação de 4 de outubro\./)
    assert.match(pagina, /Fotos em preto e branco: candidaturas que não seguem na disputa\./)
    assert.match(pagina, /<Link href="\/"[^>]*>\s*Ver o 2º turno/)
    assert.match(pagina, /<UfResultadoSelector options=\{opcoesUf\} basePath="\/1o-turno" rotulo="Resultado por estado" compacto \/>/)
  })

  it("home antiga: abas, grade completa com PB, programas e pesquisas, comparador", () => {
    assert.match(pagina, /Presidenciáveis/)
    assert.match(pagina, /href="\/governadores"/)
    assert.match(pagina, /href="\/parlamentares"/)
    assert.match(pagina, /<DeferredCandidatoGrid[\s\S]*?slugsFotoPB=\{slugsFotoPB\}/)
    assert.match(pagina, /slugsComFotoPretoEBranco\(candidatos, fasePorSlug\)/)
    assert.doesNotMatch(pagina, /recortarFinalistas/)
    assert.match(pagina, /<PresidentialElectionSections[\s\S]*?resultadoEleitoralPublicado=\{resultadoEleitoralPublicado\}/)
    assert.match(pagina, /<ComparadorPanel[^>]*slugsFotoPB=\{slugsFotoPB\}/)
    assert.doesNotMatch(pagina, /Resultado1TurnoBrasil|PesquisasPresidenciais1Turno|SegundoTurnoSection/)
  })
})
