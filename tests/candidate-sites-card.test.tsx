import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CandidateSitesCard } from "@/components/CandidateSitesCard"
import candidateSitesDataset from "@/data/candidate-sites-tse-2026.json"
import { buildCandidateSiteLinks } from "@/lib/candidate-sites"
import { buildCandidateSitesTseDataset } from "../scripts/lib/candidate-sites-tse"

const collectorReceipt = {
  fetched_at: "2026-08-26T22:12:16.324Z",
  catalog_url: "https://dadosabertos.tse.jus.br/dataset/candidatos-2026",
  catalog_license: "Creative Commons Atribuicao",
  resources: [
    {
      name: "Candidatos",
      url: "https://cdn.tse.jus.br/consulta_cand_2026.zip",
      sha256: "candidates123",
    },
    {
      name: "Redes sociais de candidatos",
      url: "https://cdn.tse.jus.br/rede_social_candidato_2026.zip",
      sha256: "abc123",
    },
  ],
}

test("preserva a ordem do TSE, deduplica e rotula dominios sem chama-los de oficiais", () => {
  const links = buildCandidateSiteLinks({
    sites: [
      { ordem: 3, url: "https://www.exemplo.com.br/" },
      { ordem: 1, url: "https://t.me/canal" },
      { ordem: 2, url: "https://discord.gg/convite" },
      { ordem: 4, url: "https://www.exemplo.com.br/" },
    ],
  })

  assert.deepEqual(links.map((link) => link.label), ["Telegram", "Discord", "EXEMPLO.COM.BR"])
  assert.equal(links[2]?.displayUrl, "exemplo.com.br")
})

test("descarta esquemas perigosos mesmo se o snapshot for adulterado", () => {
  const links = buildCandidateSiteLinks({
    sites: [
      { ordem: 1, url: "javascript:alert(1)" },
      { ordem: 2, url: "data:text/html,perigo" },
      { ordem: 3, url: "https://hostname-sem-dominio/perfil" },
      { ordem: 4, url: "https://example.org/perfil" },
    ],
  })

  assert.deepEqual(links.map((link) => link.url), ["https://example.org/perfil"])
})

test("deduplica www, caixa e barra final nas plataformas conhecidas", () => {
  const links = buildCandidateSiteLinks({
    sites: [
      { ordem: 1, url: "https://www.instagram.com/CABODACIOLO" },
      { ordem: 2, url: "https://instagram.com/cabodaciolo/" },
    ],
  })

  assert.equal(links.length, 1)
})

test("card ocupa uma celula do grid e limita a lista antes do scroll", () => {
  const html = renderToStaticMarkup(
    <CandidateSitesCard
      sites={Array.from({ length: 6 }, (_, index) => ({
        ordem: index + 1,
        url: `https://site-${index + 1}.com.br`,
      }))}
    />,
  )

  assert.match(html, /data-pf-candidate-sites-card=""/)
  assert.match(html, /data-pf-candidate-sites-count="6"/)
  assert.match(html, /data-pf-candidate-sites-scrollable="true"/)
  assert.match(html, /max-h-\[245px\]/)
  assert.match(html, /overflow-y-auto/)
  assert.match(html, /tabindex="0"/)
})

test("card nao cria caixa vazia quando o TSE nao publicou site valido", () => {
  const html = renderToStaticMarkup(<CandidateSitesCard sites={[]} />)
  assert.equal(html, "")
})

test("card explicita ausencia quando a consulta ao TSE terminou vazia", () => {
  const html = renderToStaticMarkup(
    <CandidateSitesCard sites={[]} vazioConfirmadoEm="2026-08-15" />,
  )

  assert.match(html, /Nenhum site ou rede declarado ao TSE/)
  assert.match(html, /Fonte consultada em 2026-08-15/)
  assert.match(html, /data-pf-candidate-sites-count="0"/)
})

test("card explicita declaração que não pode virar link seguro", () => {
  const html = renderToStaticMarkup(
    <CandidateSitesCard sites={[]} indeterminadoEm="2026-09-06T15:27:12.979Z" />,
  )

  assert.match(html, /Declaração do TSE sem link verificável/)
  assert.match(html, /não forma uma URL segura/)
})

test("snapshot traz a lista integral e deduplicada do Flavio Bolsonaro", () => {
  const record = candidateSitesDataset.candidates["flavio-bolsonaro"]
  assert.ok(record)
  assert.equal(record.sq_candidato, "280002551544")
  assert.equal(record.sites.length, 37)
  const urls = record.sites.map((site) => site.url?.toLowerCase())
  assert.ok(urls.some((url) => url?.includes("t.me/senadorflaviobolsonaro")))
  assert.ok(urls.some((url) => url?.includes("discord.gg/exyyrj5tf")))
  assert.ok(urls.some((url) => url?.includes("threads.com/@flaviobolsonaro")))
  assert.ok(urls.some((url) => url?.includes("flaviobolsonaro.com.br")))
})

test("sites extras ficam isolados do cabecalho da bio", () => {
  const overview = readFileSync("src/components/ProfileOverview.tsx", "utf8")
  const ficha = readFileSync(
    "src/app/(site)/candidato/[slug]/CandidatoFichaView.tsx",
    "utf8",
  )

  assert.match(overview, /<CandidateSitesCard\s+sites=\{ficha\.sites_candidato\?\.sites\}/)
  assert.match(ficha, /<SocialLinks redes=\{ficha\.redes_sociais \?\? \{\}\} site=\{ficha\.site_campanha\} \/>/)
  assert.doesNotMatch(ficha, /SocialLinks[^>]+sites_candidato/)
})

test("coletor casa por SQ, usa nome exato unico como fallback e falha fechado na ambiguidade", () => {
  const dataset = buildCandidateSitesTseDataset({
    profiles: [
      { slug: "por-sq", nome_completo: "Nome Divergente", ids: { tse_sq_candidato: { "2026": "1" } } },
      { slug: "sq-ausente", nome_completo: "Flavio Nantes Bolsonaro", cargo_disputado: "Presidente", ids: { tse_sq_candidato: { "2026": "999" } } },
      { slug: "por-nome", nome_completo: "Flavio Nantes Bolsonaro", cargo_disputado: "Presidente" },
      { slug: "ambiguo", nome_completo: "Nome Repetido", cargo_disputado: "Governador", estado: "MT" },
      { slug: "escopo-incompativel", nome_completo: "Marcos Vieira", cargo_disputado: "Governador", estado: "SC" },
    ],
    candidates: [
      { SQ_CANDIDATO: "1", NM_CANDIDATO: "Pessoa Um", SG_UF: "SP", DS_CARGO: "DEPUTADO FEDERAL" },
      { SQ_CANDIDATO: "2", NM_CANDIDATO: "FLÁVIO NANTES BOLSONARO", SG_UF: "BR", DS_CARGO: "PRESIDENTE" },
      { SQ_CANDIDATO: "3", NM_CANDIDATO: "NOME REPETIDO", SG_UF: "MT", DS_CARGO: "GOVERNADOR" },
      { SQ_CANDIDATO: "4", NM_CANDIDATO: "Nome Repetido", SG_UF: "MT", DS_CARGO: "GOVERNADOR" },
      { SQ_CANDIDATO: "5", NM_CANDIDATO: "Marcos Vieira", SG_UF: "PR", DS_CARGO: "DEPUTADO ESTADUAL" },
    ],
    socialRows: [
      { DT_GERACAO: "26/08/2026", HH_GERACAO: "19:35:09", SQ_CANDIDATO: "1", NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "EXEMPLO.COM.BR" },
      { DT_GERACAO: "26/08/2026", HH_GERACAO: "19:35:09", SQ_CANDIDATO: "2", NR_ORDEM_REDE_SOCIAL: "2", DS_URL: "HTTPS://T.ME/CANAL" },
      { DT_GERACAO: "26/08/2026", HH_GERACAO: "19:35:09", SQ_CANDIDATO: "2", NR_ORDEM_REDE_SOCIAL: "3", DS_URL: "HTTPS://T.ME/CANAL" },
    ],
    receipt: collectorReceipt,
  })

  assert.equal(dataset.candidates["por-sq"]?.match_method, "sq_candidato")
  assert.equal(dataset.candidates["sq-ausente"], undefined)
  assert.equal(dataset.candidates["por-nome"]?.match_method, "nome_completo_exato_unico")
  assert.equal(dataset.candidates["por-nome"]?.sites.length, 1)
  assert.equal(dataset.candidates.ambiguo, undefined)
  assert.equal(dataset.candidates["escopo-incompativel"], undefined)
  assert.deepEqual(dataset.ambiguous_profiles, [{ slug: "ambiguo", sq_candidato: ["3", "4"] }])
  assert.deepEqual(dataset.unmatched_declared_profiles, [
    { slug: "sq-ausente", sq_candidato: "999" },
  ])
  assert.equal(dataset.counts.declared_sq_missing, 1)
  assert.equal(dataset.counts.duplicate_rows_removed, 1)
  assert.deepEqual(dataset.verified_empty_profiles, [])
})

test("coletor seleciona a geracao mais recente pela data cronologica do TSE", () => {
  const dataset = buildCandidateSitesTseDataset({
    profiles: [
      { slug: "perfil", nome_completo: "Pessoa Um", ids: { tse_sq_candidato: { "2026": "1" } } },
    ],
    candidates: [
      { SQ_CANDIDATO: "1", NM_CANDIDATO: "Pessoa Um", SG_UF: "SP", DS_CARGO: "DEPUTADO FEDERAL" },
    ],
    socialRows: [
      { DT_GERACAO: "31/12/2025", HH_GERACAO: "22:00:00", SQ_CANDIDATO: "1", NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "https://example.org" },
      { DT_GERACAO: "01/01/2026", HH_GERACAO: "08:00:00", SQ_CANDIDATO: "1", NR_ORDEM_REDE_SOCIAL: "2", DS_URL: "https://example.com" },
    ],
    receipt: collectorReceipt,
  })

  assert.equal(dataset.source.generated_at_tse, "01/01/2026 08:00:00")
})

test("coletor preserva declaracao sem URL, mas nao a transforma em link", () => {
  const dataset = buildCandidateSitesTseDataset({
    profiles: [{ slug: "perfil", nome_completo: "Pessoa Um", ids: { tse_sq_candidato: { "2026": "1" } } }],
    candidates: [{ SQ_CANDIDATO: "1", NM_CANDIDATO: "Pessoa Um", SG_UF: "SP", DS_CARGO: "DEPUTADO FEDERAL" }],
    socialRows: [{ DT_GERACAO: "26/08/2026", HH_GERACAO: "19:35:09", SQ_CANDIDATO: "1", NR_ORDEM_REDE_SOCIAL: "1", DS_URL: "@PERFIL" }],
    receipt: collectorReceipt,
  })

  assert.deepEqual(dataset.candidates.perfil?.sites, [
    { order: 1, url: null, original_url: "@PERFIL" },
  ])
  assert.equal(dataset.counts.non_linkable_entries, 1)
})
