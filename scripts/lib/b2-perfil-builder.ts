/**
 * Nucleo PURO do gerador da migration de perfil da B2.
 *
 * Existe separado do executavel por um motivo especifico: o CLI recusa ledger
 * que nao seja o congelado, e essa recusa e fail-closed de proposito. Sem este
 * modulo, testar o comportamento com fixture exigiria um escape no executavel, e
 * escape no executavel foi exatamente o defeito das duas rodadas anteriores,
 * primeiro por variavel de ambiente e depois por caminho de arquivo.
 *
 * Aqui nao ha IO, nao ha argv e nao ha excecao de teste: o teste chama a mesma
 * funcao que o CLI chama, com as entradas que quiser.
 */

import { construirPatchVerificacaoCampos } from "../../src/lib/verificacao-campos"
import { exigirMaterializacaoTse2026, type IndiceIdentidadeEtapa2 } from "./identidade-etapa2"
import { derivarResolucoes, type PropostaB2 } from "./verificacao-campos-ledger-b2"

export interface PerfilB2 {
  candidate_slug: string
  proposals: PropostaB2[]
}

export interface RegistroTse {
  sq_candidato?: string | null
  role?: string | null
  uf?: string | null
  party?: string | null
  judgment?: string | null
  accepted_at?: string | null
}

export interface LinhaB2 {
  slug: string
  registration: RegistroTse | null
  officialSocialRecord: boolean
  networks: Record<string, string>
  site: string | null
  profession: string | null
  education: string | null
  verification: Record<string, string>
}

const byField = (profile: PerfilB2, field: string) =>
  profile.proposals.filter((item) => item.field === field)
const selected = (profile: PerfilB2, field: string, states: string[]) =>
  byField(profile, field).find((item) =>
    states.includes((item as { proposed_state?: string }).proposed_state ?? ""),
  ) ?? null

export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  let value = raw.trim().replace(/^HTTPS?:/i, (match) => match.toLowerCase())
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    return new URL(value).toString()
  } catch {
    return null
  }
}

/**
 * O host e EXATAMENTE o dominio, ou um subdominio dele.
 *
 * `host.includes("instagram.com")` casava tambem com
 * `instagram.com.dominio-de-terceiro.net` e com `naoinstagram.com`, e era o que
 * o CodeQL acusava como `js/incomplete-url-substring-sanitization` (7 alertas
 * altos). Aqui o dado vem do pacote oficial de redes do TSE, entao o risco
 * pratico e baixo, mas a classificacao errada e real: um host que so CONTEM o
 * nome da plataforma seria gravado como a rede oficial daquele candidato na
 * ficha publica.
 *
 * A forma correta ja existia no proprio arquivo, para `x.com` e `t.me`; ela so
 * nao tinha sido aplicada nas outras sete.
 */
function ehDominio(host: string, dominio: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`)
}

function platformFor(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  if (ehDominio(host, "instagram.com")) return "instagram"
  if (ehDominio(host, "facebook.com")) return "facebook"
  if (ehDominio(host, "youtube.com") || ehDominio(host, "youtu.be")) return "youtube"
  if (ehDominio(host, "tiktok.com")) return "tiktok"
  if (ehDominio(host, "x.com") || ehDominio(host, "twitter.com")) return "twitter"
  if (ehDominio(host, "linkedin.com")) return "linkedin"
  if (ehDominio(host, "t.me") || ehDominio(host, "telegram.me") || ehDominio(host, "telegram.org")) {
    return "telegram"
  }
  if (ehDominio(host, "kwai.com")) return "kwai"
  return "site_oficial"
}

function socialMap(proposal: PropostaB2 | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of (proposal?.proposed_value ?? []) as { url?: unknown }[]) {
    const url = normalizeUrl(item.url)
    if (!url) continue
    out[platformFor(url)] ??= url
  }
  return out
}

/** Uma linha por perfil, com o contrato de `verificacao_campos` ja aplicado. */
export function construirLinhasB2(profiles: readonly PerfilB2[]): LinhaB2[] {
  return profiles.map((profile) => {
    const registration =

      (selected(profile, "current_candidacy_status", [
        "official_registration_found_not_equivalent_to_approval",
      ])?.proposed_value as RegistroTse | undefined) ?? null
    const socialProposal = selected(profile, "social_networks", [
      "official_self_declared_merge_fill_only",
    ])
    const siteProposal = selected(profile, "campaign_site", [
      "materialize_existing_site_oficial",
      "official_self_declared_website_for_review",
    ])
    const profession =
      (selected(profile, "profession", ["official_2026_value_for_review"])?.proposed_value as
        | string
        | undefined) ?? null
    const education =
      (selected(profile, "education", ["official_2026_value_for_review"])?.proposed_value as
        | string
        | undefined) ?? null

    /**
     * O ponto de enforcement. O `proposed_value` das datas entra APENAS como
     * portador do agregado curado, que nao tem campo proprio no ledger. Tudo o
     * mais e derivado do `query_result` de cada campo, traduzido por tabela
     * fechada, e passa por `construirPatchVerificacaoCampos`.
     */
    const datasBrutas =
      (selected(profile, "source_verification_dates", ["metadata_ready_for_field_level_storage"])
        ?.proposed_value as Record<string, unknown> | undefined) ?? {}
    const resolucoes = derivarResolucoes(profile.proposals, datasBrutas.existing_profile_aggregate)
    const { patch: verification, rejeitadas } = construirPatchVerificacaoCampos(null, resolucoes)
    if (rejeitadas.length > 0) {
      throw new Error(
        `${profile.candidate_slug}: estado avanca frescor sem data utilizavel em ` +
          `${rejeitadas.map((r) => r.chave).join(", ")}. Data inventada nunca e opcao.`,
      )
    }

    const networks = socialMap(socialProposal)
    const officialSocialRecord = socialProposal != null
    const site = normalizeUrl(siteProposal?.proposed_value)
    delete networks.site_oficial

    return {
      slug: profile.candidate_slug,
      registration,
      officialSocialRecord,
      networks,
      site,
      profession,
      education,
      verification,
    }
  })
}

/**
 * Porta da etapa 2 mais conferencia de identidade canonica contra o seed.
 *
 * Roda para QUALQUER entrada. Slug com registro que nao existe no seed BLOQUEIA:
 * nao poder comparar identidade e razao para nao materializar, nao licenca para
 * materializar sem comparar.
 */
export function conferirIdentidadeDasLinhas(
  linhas: readonly LinhaB2[],
  seed: readonly { slug: string; ids?: { tse_sq_candidato?: Record<string, string> | null } | null }[],
  indice?: IndiceIdentidadeEtapa2,
): void {
  const slugsDoSeed = new Set(seed.map((c) => c.slug))
  const sqDoSeed = new Map(seed.map((c) => [c.slug, c.ids?.tse_sq_candidato?.["2026"]]))

  const bloqueados: string[] = []
  for (const row of linhas) {
    if (!row.registration?.sq_candidato) continue
    let chave: { type: "SQ_CANDIDATO"; value: string } | null
    try {
      chave = exigirMaterializacaoTse2026(row.slug, indice)
    } catch (erro) {
      bloqueados.push(`${row.slug}: ${erro instanceof Error ? erro.message : erro}`)
      continue
    }
    if (chave && chave.value !== String(row.registration.sq_candidato)) {
      bloqueados.push(
        `${row.slug}: a etapa 2 confirmou o SQ ${chave.value}, e a fila traz ${row.registration.sq_candidato}`,
      )
    }
  }
  if (bloqueados.length > 0) {
    throw new Error(
      `materializacao barrada pela etapa 2:\n  ${bloqueados.join("\n  ")}\n\n` +
        `SQ_CANDIDATO confirmado e a chave eleitoral de persistencia. Se a identidade foi ` +
        `confirmada depois de 09/08, regenere o registro com ` +
        `\`npm run data:identidade-etapa2:gerar\` sobre um snapshot novo do TSE.`,
    )
  }

  const semIdentidadeCanonica = linhas.filter((row) => row.registration && !slugsDoSeed.has(row.slug))
  if (semIdentidadeCanonica.length > 0) {
    throw new Error(
      `registro TSE para slug que nao existe em data/candidatos.json: ` +
        `${semIdentidadeCanonica.map((row) => row.slug).join(", ")}. ` +
        `Sem identidade canonica no seed nao ha com o que comparar o SQ, e materializar assim ` +
        `criaria candidatura por fora do cadastro.`,
    )
  }

  const divergentes = linhas.filter(
    (row) =>
      row.registration &&
      String(sqDoSeed.get(row.slug) ?? "") !== String(row.registration.sq_candidato),
  )
  if (divergentes.length > 0) {
    throw new Error(
      `SQ 2026 ausente ou divergente no seed: ${divergentes.map((row) => row.slug).join(", ")}`,
    )
  }
}

export function contarLinhasB2(linhas: readonly LinhaB2[]) {
  const n = (p: (row: LinhaB2) => unknown) => linhas.filter(p).length
  return {
    profiles: linhas.length,
    registrations: n((r) => r.registration),
    official_social_records: n((r) => r.officialSocialRecord),
    social_profiles: n((r) => Object.keys(r.networks).length > 0),
    sites: n((r) => r.site),
    professions: n((r) => r.profession),
    education: n((r) => r.education),
    verification: n((r) => Object.keys(r.verification).length > 0),
  }
}
