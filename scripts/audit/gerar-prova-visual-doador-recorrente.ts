/**
 * Prova visual da seção de doador recorrente, antes de a migration existir no
 * banco.
 *
 * Monta a mesma pipeline que rodará em produção (materialização -> formato da
 * view -> agrupamento público -> DTO) a partir das tabelas que já existem, e
 * renderiza a aba Dinheiro com os componentes reais. A saída é um HTML que
 * aponta para o CSS compilado do app, para screenshot em desktop e mobile.
 *
 * Duas etapas, porque a leitura da ficha é server-only (condição react-server)
 * e o render estático não roda sob essa condição:
 *   node --conditions react-server --import tsx scripts/audit/gerar-prova-visual-doador-recorrente.ts --etapa dados --output .tmp/doador-recorrente
 *   node --import tsx scripts/audit/gerar-prova-visual-doador-recorrente.ts --etapa render --output .tmp/doador-recorrente
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { toPublicCandidatoProfileDto } from "../../src/lib/public-profile-dto"
import {
  agruparDoadoresRecorrentes,
  type DoadorRecorrenteViewRow,
} from "../../src/lib/doador-recorrente-publico"
import type { FichaCandidato } from "../../src/lib/types"
import { supabase } from "../lib/supabase"
import { getCanonicalPerson } from "../../src/lib/canonical-person-map"
import {
  materializarDoadoresRecorrentes,
  type CandidatoPublicoRef,
  type FinanciamentoLinhaBruta,
} from "../lib/doador-recorrente"

async function todas<T>(tabela: string, colunas: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(offset, offset + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    const pagina = (data ?? []) as unknown as T[]
    rows.push(...pagina)
    if (pagina.length < 1000) break
  }
  return rows
}

function argumento(nome: string, padrao: string): string {
  const index = process.argv.indexOf(nome)
  return index >= 0 ? (process.argv[index + 1] ?? padrao) : padrao
}

async function render(output: string): Promise<void> {
  const { createElement } = await import("react")
  const { renderToStaticMarkup } = await import("react-dom/server")
  const { MoneyTabSection } = await import("../../src/components/CandidatoProfileSections")
  const fichas = JSON.parse(readFileSync(path.join(output, "dados.json"), "utf8")) as Array<{
    slug: string
    titulo: string
    dto: FichaCandidato
  }>
  for (const { slug, titulo, dto } of fichas) {
    const corpo = renderToStaticMarkup(
      createElement(
        "main",
        { className: "mx-auto max-w-7xl px-5 py-8 md:px-12" },
        createElement("h1", { className: "mb-6 text-2xl font-bold" }, `${titulo}: ${slug}`),
        createElement(MoneyTabSection, {
          patrimonio: dto.patrimonio ?? [],
          patrimonioEleicoes: dto.patrimonio_eleicoes ?? null,
          financiamento: dto.financiamento ?? [],
          doadoresRecorrentes: dto.doadores_recorrentes ?? null,
          financiamentoEleicoes: dto.financiamento_eleicoes ?? null,
          historico: dto.historico ?? [],
          gastos: dto.gastos_parlamentares ?? [],
          historicoLength: dto.historico?.length ?? 0,
          suggestion: null,
        }),
      ),
    )
    writeFileSync(
      path.join(output, `${slug}.html`),
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="app.css"><title>${titulo}</title></head><body class="bg-background text-foreground">${corpo}</body></html>\n`,
    )
  }

  const cssDir = path.resolve(".next/static/chunks")
  const css = readdirSync(cssDir)
    .filter((nome) => nome.endsWith(".css"))
    .sort()
  if (css.length === 0) throw new Error("rode `npm run build` antes: sem CSS compilado")
  writeFileSync(
    path.join(output, "app.css"),
    css.map((nome) => readFileSync(path.join(cssDir, nome), "utf8")).join("\n"),
  )
  console.log(`prova visual em ${output}: ${fichas.map((f) => `${f.slug}.html`).join(", ")}`)
}

async function main(): Promise<void> {
  const output = path.resolve(argumento("--output", ".tmp/doador-recorrente"))
  const etapa = argumento("--etapa", "dados")
  mkdirSync(output, { recursive: true })
  if (etapa === "render") {
    await render(output)
    return
  }

  const financiamentos = await todas<FinanciamentoLinhaBruta & { despublicado_em: string | null }>(
    "financiamento",
    "id, candidato_id, ano_eleicao, maiores_doadores, maiores_doadores_publicos, despublicado_em",
  )
  const candidatos = await todas<CandidatoPublicoRef & { nome_urna: string | null; partido_sigla: string | null }>(
    "candidatos_publico",
    "id, slug, nome_completo, nome_urna, partido_sigla, data_nascimento",
  )
  const nomes = await todas<{ nome_completo: string | null }>("candidatos", "nome_completo")

  const resultado = materializarDoadoresRecorrentes({
    financiamentos: financiamentos.filter((linha) => linha.despublicado_em === null),
    candidatosPublicos: candidatos,
    nomesDeCandidatos: nomes.map((c) => c.nome_completo),
    canonicalSlugDe: (slug) => getCanonicalPerson(slug).canonicalSlug,
    novoGrupo: randomUUID,
  })

  const porCandidato = new Map<string, typeof resultado.linhas>()
  for (const linha of resultado.linhas) {
    porCandidato.set(linha.candidato_id, [...(porCandidato.get(linha.candidato_id) ?? []), linha])
  }
  const candidatoPorId = new Map(candidatos.map((c) => [c.id, c]))

  // Mesma projeção da view: pares do mesmo grupo entre pessoas diferentes.
  function paresDaFicha(candidatoId: string): DoadorRecorrenteViewRow[] {
    const minhas = porCandidato.get(candidatoId) ?? []
    const pares: DoadorRecorrenteViewRow[] = []
    for (const linha of minhas) {
      for (const outra of resultado.linhas) {
        if (outra.doador_grupo !== linha.doador_grupo || outra.pessoa_chave === linha.pessoa_chave) continue
        const outroCandidato = candidatoPorId.get(outra.candidato_id)
        if (!outroCandidato) continue
        pares.push({
          candidato_id: candidatoId,
          ano_eleicao: linha.ano_eleicao,
          doador_grupo: linha.doador_grupo,
          doador_nome: linha.doador_nome,
          doador_tipo: linha.doador_tipo,
          valor: linha.valor,
          outra_ano_eleicao: outra.ano_eleicao,
          outra_valor: outra.valor,
          outra_slug: outroCandidato.slug,
          outra_nome_urna: outroCandidato.nome_urna,
          outra_partido_sigla: outroCandidato.partido_sigla,
        })
      }
    }
    return pares
  }

  const candidatosComRecorrente = [...porCandidato.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([id]) => candidatoPorId.get(id)?.slug)
    .filter((slug): slug is string => Boolean(slug) && !String(slug).startsWith("tse-"))
  const idsComRecorrente = new Set(porCandidato.keys())
  const idsComFinanciamento = new Set(
    financiamentos.filter((f) => f.despublicado_em === null).map((f) => f.candidato_id),
  )
  // Caso vazio pedido: ficha só com financiamento pós-2016, quando o dinheiro
  // é fundo, pessoa física e recursos próprios.
  const anosPorCandidato = new Map<string, number[]>()
  for (const f of financiamentos) {
    if (f.despublicado_em !== null) continue
    anosPorCandidato.set(f.candidato_id, [...(anosPorCandidato.get(f.candidato_id) ?? []), f.ano_eleicao])
  }
  const candidatosSemRecorrente = candidatos
    .filter((c) => idsComFinanciamento.has(c.id) && !idsComRecorrente.has(c.id))
    .filter((c) => (anosPorCandidato.get(c.id) ?? []).every((ano) => ano >= 2018))
    .filter((c) => !c.slug.startsWith("tse-"))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((c) => c.slug)
  if (candidatosComRecorrente.length === 0 || candidatosSemRecorrente.length === 0) {
    throw new Error("não achei os dois casos para a prova")
  }

  if (etapa === "dados") {
    const { getCandidatoBySlugPreviewResource } = await import("../../src/lib/api")
    const fichas = []
    // A ficha exibível é a que a leitura pública resolve; cadastro sem ficha
    // (cargo não exposto) é pulado no caso vazio.
    const primeiraExibivel = async (slugs: string[]) => {
      for (const slug of slugs.slice(0, 40)) {
        if ((await getCandidatoBySlugPreviewResource(slug)).data) return slug
      }
      throw new Error("nenhuma ficha exibível no recorte")
    }
    const slugComRecorrente = await primeiraExibivel(candidatosComRecorrente)
    const slugSemRecorrente = await primeiraExibivel(candidatosSemRecorrente)
    for (const [slug, titulo] of [
      [slugComRecorrente, "Ficha com doador recorrente"],
      [slugSemRecorrente, "Ficha sem doador recorrente"],
    ] as const) {
      const recurso = await getCandidatoBySlugPreviewResource(slug)
      if (!recurso.data) throw new Error(`ficha ${slug} indisponível`)
      const dto = toPublicCandidatoProfileDto({
        ...recurso.data,
        doadores_recorrentes: agruparDoadoresRecorrentes(paresDaFicha(recurso.data.id)),
      }) as unknown as FichaCandidato
      fichas.push({ slug, titulo, dto })
      console.log(`${titulo}: ${slug} doadores_recorrentes=${dto.doadores_recorrentes?.length ?? "null"}`)
    }
    writeFileSync(path.join(output, "dados.json"), `${JSON.stringify(fichas)}\n`)
    return
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
