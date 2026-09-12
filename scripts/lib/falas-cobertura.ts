import { periodoDaFala, type CatalogoFalas, type FalaCandidato } from "../../src/lib/falas-candidatos"
import { naJanela, naJanelaInicial, type CandidatoFalas } from "./falas-monitoramento"

const periodoDentro = (quote: FalaCandidato, now: Date, janela: typeof naJanela) => {
  const period = periodoDaFala(quote)
  return !!period && janela(period.from, now) && janela(period.to, now)
}

export interface BuscaIndividual {
  candidate_id: string
  queries: string[]
  urls: string[]
  status: "searched" | "blocked" | "not_searched"
  errors: string[]
}

export function medirCobertura(roster: CandidatoFalas[], catalog: CatalogoFalas, searches: BuscaIndividual[], now: Date) {
  const candidates = roster.map((candidate) => {
    const quotes = catalog.quotes.filter((quote) => quote.candidate_id === candidate.id && quote.candidate_slug === candidate.slug && periodoDentro(quote, now, naJanelaInicial))
    const recent = quotes.filter((quote) => periodoDentro(quote, now, naJanela))
    const attempts = searches.filter((entry) => entry.candidate_id === candidate.id)
    const searchStatus = attempts.some((entry) => entry.status === "searched") ? "searched" : attempts.some((entry) => entry.status === "blocked") ? "blocked" : "not_searched"
    return { id: candidate.id, slug: candidate.slug, name: candidate.nome_urna, office: candidate.cargo_disputado, uf: candidate.estado,
      status: quotes.length ? "covered" : searchStatus === "searched" ? "searched_without_verified_quote" : searchStatus === "blocked" ? "search_blocked" : "not_searched",
      freshness: recent.length ? "recent" : quotes.length ? "historical" : "missing",
      quote_count: quotes.length, recent_quote_count: recent.length, quote_ids: quotes.map((quote) => quote.id),
      queries: [...new Set(attempts.flatMap((entry) => entry.queries))], urls: [...new Set(attempts.flatMap((entry) => entry.urls))], errors: [...new Set(attempts.flatMap((entry) => entry.errors))] }
  })
  const covered = candidates.filter((candidate) => candidate.status === "covered").length
  const recentCovered = candidates.filter((candidate) => candidate.freshness === "recent").length
  return { schema_version: "falas-cobertura-v2", observed_at: now.toISOString(), window_days: 14, initial_search_start: "2026-08-16", total: candidates.length, covered,
    recent_covered: recentCovered, historical_only: covered - recentCovered, recent_coverage_complete: candidates.length > 0 && recentCovered === candidates.length,
    missing: candidates.length - covered, coverage_complete: candidates.length > 0 && covered === candidates.length,
    search_attempted_for_all: candidates.length > 0 && candidates.every((candidate) => candidate.status !== "not_searched" && candidate.queries.length > 0),
    search_complete: roster.length > 0 && roster.every((candidate) => searches.some((entry) => entry.candidate_id === candidate.id && entry.status === "searched" && entry.queries.length > 0)), candidates }
}

export function paginaCobertura(coverage: ReturnType<typeof medirCobertura>, catalog: CatalogoFalas): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
  const safeHref = (value: string): string | null => {
    try {
      const url = new URL(value)
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null
    } catch {
      return null
    }
  }
  const safeLink = (value: string, label = value): string => {
    const href = safeHref(value)
    return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(value)
  }
  const date = (day: string) => day.slice(0, 10).split("-").reverse().join("/")
  const rows = [...coverage.candidates].sort((a,b) => (a.uf ?? "BR").localeCompare(b.uf ?? "BR") || a.name.localeCompare(b.name, "pt-BR")).map((candidate) => {
    const quotes = catalog.quotes.filter((q) => candidate.quote_ids.includes(q.id))
    const detail = quotes.length ? quotes.map((q) => `<blockquote>“${escape(q.quote_text)}”<footer>${escape(q.event_type === "declaracao" ? "Declaração em campanha" : q.event_type)} · ${q.occurred_on ? date(q.occurred_on) : q.occurred_between!.from === q.occurred_between!.to ? date(q.occurred_between!.from) : `Entre ${date(q.occurred_between!.from)} e ${date(q.occurred_between!.to)} (dia exato não informado)`}${periodoDentro(q, new Date(coverage.observed_at), naJanela) ? "" : " · Histórico"} · ${safeLink(q.article_url, q.publisher)}${q.transcription ? ` · Transcrição automática, pode conter erros. ${safeLink(q.transcription.media_url + (q.transcription.media_url.includes("youtube.com/watch?") ? `&t=${Math.floor(q.transcription.start_seconds)}s` : `#t=${Math.floor(q.transcription.start_seconds)}`), "Conferir áudio no trecho")}` : ""}</footer></blockquote>`).join("")
      : `<p class="pending">${candidate.status === "not_searched" ? "Pesquisa ainda não registrada." : candidate.status === "search_blocked" ? "Fonte bloqueada; sem aspa verificada." : "Buscas registradas; nenhuma aspa verificada até agora."}</p>`
    const pendingReasons = !quotes.length && candidate.errors.length ? `<details><summary>Motivos registrados para a pendência</summary><ul>${candidate.errors.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul></details>` : ""
    return `<article data-covered="${quotes.length > 0}" data-search="${escape(`${candidate.name} ${candidate.uf ?? "BR"} ${candidate.office}`.toLocaleLowerCase("pt-BR"))}"><h2>${escape(candidate.name)} <span>${escape(candidate.office)} · ${escape(candidate.uf ?? "BR")}</span></h2>${detail}${pendingReasons}<details><summary>Consultas e URLs registradas (${candidate.queries.length})</summary><ul>${candidate.queries.map((q) => `<li>${escape(q)}</li>`).join("")}</ul><ul>${candidate.urls.map((url) => `<li>${safeLink(url)}</li>`).join("")}</ul></details></article>`
  }).join("")
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Falas por candidato · Puxa Ficha</title><style>body{font:16px/1.6 system-ui;background:#f5f4ef;color:#192420;margin:0}main{max-width:960px;margin:auto;padding:32px 20px}h1{font-size:36px;line-height:1.2}h2{font-size:20px}h2 span{display:block;font-size:13px;color:#68736c}article{background:white;padding:22px;margin:16px 0;border:1px solid #dce2dc;border-radius:14px}blockquote{margin:16px 0;font-size:19px}footer,details{font-size:13px}a{color:#126148;overflow-wrap:anywhere}.pending{color:#806117}.stats{font-size:22px;font-weight:600}.filter{display:flex;gap:16px;flex-wrap:wrap;align-items:center;position:sticky;top:0;background:#f5f4ef;padding:16px 0}input[type=search]{font:inherit;padding:10px;border:1px solid #abc3b2;border-radius:8px;min-width:240px}.note{color:#66706a}article[hidden]{display:none}</style><main><p>Puxa Ficha · prévia local</p><h1>Falas por candidato</h1><p class="stats">${coverage.covered} com aspas · ${coverage.missing} pendentes · ${coverage.total} candidatos</p><p class="note">${coverage.recent_covered} com falas nos últimos 14 dias · ${coverage.historical_only} com falas anteriores. Busca inicial somente na campanha, desde 16/08/2026, apurada em ${date(coverage.observed_at)}. Datas originais preservadas. Prévia local, ainda não publicada.</p><div class="filter"><input type="search" aria-label="Buscar candidato ou UF" placeholder="Buscar candidato ou UF"><label><input type="checkbox"> Mostrar apenas pendentes</label><span id="count"></span></div>${rows}</main><script>const search=document.querySelector('input[type=search]'),pending=document.querySelector('input[type=checkbox]');function filter(){let n=0;document.querySelectorAll('article').forEach(row=>{row.hidden=!row.dataset.search.includes(search.value.toLocaleLowerCase('pt-BR'))||(pending.checked&&row.dataset.covered==='true');if(!row.hidden)n++});document.getElementById('count').textContent=n+' candidatos'}search.addEventListener('input',filter);pending.addEventListener('change',filter);filter()</script></html>`
}
