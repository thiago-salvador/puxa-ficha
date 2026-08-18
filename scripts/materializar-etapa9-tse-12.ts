/**
 * Etapa 9 da re-verificação `pf-reverificacao-20260809`: materializa as três
 * frentes TSE de `verificacao_campos` para os `match_fresco` da etapa 2.
 *
 * Universo: derivado do registro versionado `data/identidade-etapa2-2026.json`,
 * nunca de lista digitada aqui. Cada slug passa por
 * `exigirMaterializacaoTse2026`, que lança para qualquer classe que não seja
 * `match_fresco` e para registro vencido (`revalidar_ate`).
 *
 * Data carimbada: `decidido_em` do próprio registro, a data em que as frentes
 * foram verificadas contra o snapshot oficial do TSE (catalog de 08/08/2026 em
 * `output/pf-reverificacao-20260809/sources/`). Nunca `now()`: o contrato de
 * `src/lib/verificacao-campos.ts` rejeita data ausente em vez de inventá-la, e
 * este script segue a mesma regra na origem.
 *
 * Estados: `registration`/`complement` presentes viram `publicado`;
 * `social_networks` com `social_count: 0` vira `vazio_confirmado` (fonte
 * consultada por SQ seguro que respondeu sem registros, precedente de
 * `cleber-rabelo` em Settings/OBJECTIVE.md), nunca chave ausente e nunca null.
 *
 * Merge: leitura do valor atual e `{...atual, ...patch}`, o espelho em JS do
 * `COALESCE(verificacao_campos,'{}') || patch` do banco; o patch é
 * `Record<string, string>` por construção, então não carrega null que apagaria
 * data boa.
 *
 * Uso:
 *   npm run tsx scripts/materializar-etapa9-tse-12.ts            # dry-run
 *   npm run tsx scripts/materializar-etapa9-tse-12.ts -- --apply # escreve
 */

import { carregarIdentidadeEtapa2, exigirMaterializacaoTse2026 } from "./lib/identidade-etapa2"
import { CLASSE_QUE_PROMOVE_CHAVE } from "./lib/identidade-etapa2-classificador"
import {
  construirPatchVerificacaoCampos,
  CHAVES_TSE_PERFIL,
  type ResolucaoCampo,
} from "../src/lib/verificacao-campos"
import { escreverAuditado } from "./lib/escrita-auditada"
import { supabase } from "./lib/supabase"
import { log, error as logErro } from "./lib/logger"

interface LinhaPlanejada {
  slug: string
  sq: string
  patch: Record<string, string>
  atual: Record<string, string | null>
  /**
   * Todas as frentes ja gravadas com EXATAMENTE o mesmo valor. Reescrever seria
   * inofensivo no dado (o patch e identico), mas produziria uma linha de escrita
   * auditada por slug afirmando trabalho que nao houve, e a trilha e o que a
   * reconciliacao le. Rodada que nao muda nada tem que dizer que nao mudou nada.
   */
  jaMaterializado: boolean
}

function resolucoesDaEntrada(frentes: {
  registration: boolean
  complement: boolean
  social_networks: boolean
  social_count: number
}, dataVerificacao: string): ResolucaoCampo[] {
  if (frentes.registration !== true || frentes.complement !== true) {
    throw new Error(
      "match_fresco sem registro ou complemento no snapshot; isso contradiz a própria classe",
    )
  }
  return [
    { chave: "candidate_registration", estado: "publicado", verificadoEm: dataVerificacao },
    { chave: "candidate_complement", estado: "publicado", verificadoEm: dataVerificacao },
    {
      chave: "social_networks",
      estado: frentes.social_count > 0 ? "publicado" : "vazio_confirmado",
      verificadoEm: dataVerificacao,
    },
  ]
}

async function planejar(): Promise<LinhaPlanejada[]> {
  const indice = carregarIdentidadeEtapa2()
  const dataVerificacao = indice.registro.decidido_em
  const elegiveis = indice.todos.filter((e) => e.classe === CLASSE_QUE_PROMOVE_CHAVE)

  if (elegiveis.length !== indice.registro.contagem[CLASSE_QUE_PROMOVE_CHAVE]) {
    throw new Error(
      `contagem de ${CLASSE_QUE_PROMOVE_CHAVE} divergente do registro: ` +
        `${elegiveis.length} observados`,
    )
  }

  const slugs = elegiveis.map((e) => e.slug)
  const { data, error } = await supabase
    .from("candidatos")
    .select("slug, verificacao_campos, publicavel")
    .in("slug", slugs)
  if (error) throw new Error(`leitura pré-escrita falhou: ${error.message}`)
  const porSlug = new Map((data ?? []).map((r) => [r.slug as string, r]))

  const planejadas: LinhaPlanejada[] = []
  for (const entrada of elegiveis) {
    // A porta fail-closed: classe errada ou registro vencido lançam aqui.
    const chave = exigirMaterializacaoTse2026(entrada.slug, indice)
    if (!chave) throw new Error(`${entrada.slug}: dentro do universo mas sem chave promovida`)

    const linha = porSlug.get(entrada.slug)
    if (!linha) throw new Error(`${entrada.slug}: não encontrado em candidatos`)
    if (linha.publicavel !== true) throw new Error(`${entrada.slug}: não publicável`)

    const frentes = entrada.frentes_tse
    if (!frentes) throw new Error(`${entrada.slug}: match_fresco sem frentes_tse`)

    const atual = (linha.verificacao_campos ?? {}) as Record<string, string | null>
    const { patch, rejeitadas } = construirPatchVerificacaoCampos(
      atual,
      resolucoesDaEntrada(frentes, dataVerificacao),
    )
    if (rejeitadas.length > 0) {
      throw new Error(
        `${entrada.slug}: ${rejeitadas.length} frente(s) rejeitada(s) pelo contrato: ` +
          rejeitadas.map((r) => `${r.chave} (${r.motivo})`).join("; "),
      )
    }
    if (Object.keys(patch).length !== CHAVES_TSE_PERFIL.length) {
      throw new Error(
        `${entrada.slug}: patch com ${Object.keys(patch).length} chave(s), esperado ` +
          `${CHAVES_TSE_PERFIL.length}; frentes TSE parciais não materializam`,
      )
    }

    const jaMaterializado = CHAVES_TSE_PERFIL.every((k) => atual[k] === patch[k])
    planejadas.push({ slug: entrada.slug, sq: chave.value, patch, atual, jaMaterializado })
  }

  return planejadas
}

async function main(): Promise<void> {
  const aplicar = process.argv.slice(2).includes("--apply")
  const planejadas = await planejar()

  for (const p of planejadas) {
    log(
      "etapa9",
      p.jaMaterializado
        ? `${p.slug} (SQ ${p.sq}): PULADO, verificacao_campos já idêntico ao patch`
        : `${p.slug} (SQ ${p.sq}): ${JSON.stringify(p.patch)}` +
            (Object.keys(p.atual).length > 0 ? ` sobre ${JSON.stringify(p.atual)}` : " sobre {}"),
    )
  }
  const aEscrever = planejadas.filter((p) => !p.jaMaterializado)
  const pulados = planejadas.length - aEscrever.length
  log(
    "etapa9",
    `${planejadas.length} planejado(s), ${pulados} já materializado(s), ${aEscrever.length} a escrever`,
  )

  if (!aplicar) {
    log("etapa9", "dry-run concluído; nenhuma escrita. Rode com --apply para materializar.")
    return
  }

  let escritas = 0
  for (const p of aEscrever) {
    const mesclado = { ...p.atual, ...p.patch }
    const linhas = await escreverAuditado(
      {
        script: "materializar-etapa9-tse-12",
        tabela: "candidatos",
        motivo:
          "etapa 9 pf-reverificacao-20260809: frentes TSE 2026 verificadas por SQ no snapshot de 08/08",
        recorte: `${p.slug} (SQ ${p.sq})`,
      },
      () =>
        supabase
          .from("candidatos")
          .update({ verificacao_campos: mesclado })
          .eq("slug", p.slug)
          .select("slug"),
    )
    if (linhas.length !== 1) {
      throw new Error(
        `${p.slug}: escrita tocou ${linhas.length} linha(s), esperado exatamente 1; abortando o lote`,
      )
    }
    escritas += linhas.length
  }

  if (escritas !== aEscrever.length) {
    throw new Error(`volume medido ${escritas} difere do planejado para escrita ${aEscrever.length}`)
  }
  if (escritas + pulados !== planejadas.length) {
    throw new Error(
      `contabilidade inconsistente: ${escritas} escritas + ${pulados} pulados != ${planejadas.length} planejados`,
    )
  }
  log(
    "etapa9",
    `--apply concluído: ${escritas} materializado(s), ${pulados} pulado(s), ${planejadas.length} conferido(s)`,
  )
}

if (import.meta.filename === process.argv[1]) {
  main().catch((err) => {
    logErro("etapa9", err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
