export type ProgramaGovernoRevisaoEvidencia = {
  documentoId?: string
  pagina: number
  trecho: string
}

export type ProgramaGovernoRevisaoResumo = {
  texto: string
  frases: Array<{ texto: string; evidencias: ProgramaGovernoRevisaoEvidencia[] }>
  temas: Array<{ id: string; titulo: string; descricao: string; evidencias: ProgramaGovernoRevisaoEvidencia[] }>
}

export type ProgramaGovernoRevisaoRegistro = {
  version: number
  estado: string
  fonte: {
    ano: number
    cargo: string
    uf: string
    sqCandidato: string
    slug: string | null
    nomeUrna: string
    partido: string
    pacoteUrl: string
    datasetUrl: string
    pdfOriginalUrl: string | null
    coletadoEm: string
    arquivoNome?: string | null
    arquivoNoPacote?: string | null
  }
  documentos?: Array<{
    documentoId: string
    fonte: { arquivoNome: string; arquivoNoPacote: string; pacoteUrl: string; pdfOriginalUrl: string | null }
    extracao: { sourceSha256: string; extractedTextSha256: string; paginas: number; secoes: unknown[] }
  }>
  resumo?: ProgramaGovernoRevisaoResumo
  geracao?: { promptVersion: string; model: string; generatedAt: string }
  julgamento?: { model: string; promptVersion?: string; judgedAt: string; verdicts: Array<{ id: string; verdict: string; reason: string }> }
  ingestao?: {
    identityKey: string
    etapa: string
    erro: string | null
    eval: { completo: boolean; blockers: number; dimensoes: readonly string[] } | null
  }
}

export type ProgramaGovernoRevisaoOpcoes = {
  titulo: string
  mensagemNadaAprovado: boolean
  /** Resolve o link para o texto extraído do candidato; só pode devolver URL/caminho que existe de fato. */
  resolverLinkTextoExtraido?: (registro: ProgramaGovernoRevisaoRegistro) => string | null
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
}

export function contarEstadosProgramaGovernoRevisao(registros: readonly ProgramaGovernoRevisaoRegistro[]): Record<string, number> {
  const contagem: Record<string, number> = {}
  for (const registro of registros) contagem[registro.estado] = (contagem[registro.estado] ?? 0) + 1
  return contagem
}

export function assertProgramaGovernoRevisaoSemAprovado(registros: readonly ProgramaGovernoRevisaoRegistro[]): void {
  const aprovados = registros.filter((registro) => registro.estado === "aprovado")
  if (aprovados.length > 0) throw new Error(`revisao contem ${aprovados.length} registro(s) aprovado(s)`)
}

const ESTADO_ROTULO: Record<string, string> = {
  em_revisao: "Em revisão",
  perfil_local_ausente: "Perfil local ausente",
  sem_documento_oficial: "Sem documento oficial no TSE",
  falha_de_extracao: "Falha de extração",
  aprovado: "APROVADO (não deveria existir)",
}

function fonteLinha(registro: ProgramaGovernoRevisaoRegistro): string {
  const fonte = registro.fonte
  const disponibilidade = registro.documentos?.length
    ? `${registro.documentos.length} documento(s), ${registro.documentos.reduce((total, doc) => total + doc.extracao.paginas, 0)} página(s)`
    : "sem documento localizado na consulta registrada"
  return [
    `<p><strong>Fonte oficial:</strong> <a href="${escapeHtml(fonte.pacoteUrl)}">pacote ZIP do TSE</a>; dataset <a href="${escapeHtml(fonte.datasetUrl)}">DivulgaCand</a>${fonte.pdfOriginalUrl ? `; PDF original: <a href="${escapeHtml(fonte.pdfOriginalUrl)}">link direto</a>` : ""}; coletado em ${escapeHtml(fonte.coletadoEm)}.</p>`,
    `<p><strong>Disponibilidade observada:</strong> ${escapeHtml(disponibilidade)}.</p>`,
  ].join("")
}

function documentosLinha(registro: ProgramaGovernoRevisaoRegistro): string {
  if (!registro.documentos?.length) return ""
  const itens = registro.documentos.map((doc) => {
    const extracao = doc.extracao as { sourceSha256?: string; extractedTextSha256?: string; paginas?: number; secoes?: unknown[] } & Record<string, unknown>
    const metodo = typeof extracao.method === "string" ? escapeHtml(extracao.method) : "metodo nao registrado"
    const versaoExtracao = typeof extracao.extractionVersion === "number" ? String(extracao.extractionVersion) : "n/d"
    return `<li><code>${escapeHtml(doc.documentoId)}</code>: ${escapeHtml(doc.fonte.arquivoNome)} (${escapeHtml(doc.fonte.arquivoNoPacote)}) · SHA-256 fonte <code>${escapeHtml(String(extracao.sourceSha256 ?? "ausente"))}</code> · SHA-256 texto extraído <code>${escapeHtml(String(extracao.extractedTextSha256 ?? "ausente"))}</code> · extrator <code>${metodo}</code> v<code>${escapeHtml(versaoExtracao)}</code> · ${String(extracao.paginas ?? "?")} páginas · ${Array.isArray(extracao.secoes) ? extracao.secoes.length : "?"} seções</li>`
  }).join("")
  return `<details><summary>Documentos e hashes</summary><ul>${itens}</ul></details>`
}

function ambiguidadesSecao(registro: ProgramaGovernoRevisaoRegistro): string {
  const observacoes: string[] = []
  if (registro.ingestao?.erro) {
    observacoes.push(`Ambiguidade/bloqueio registrado pela ingestão (${escapeHtml(registro.ingestao.etapa)}): ${escapeHtml(registro.ingestao.erro)}.`)
  }
  const vereditosDivergentes = registro.julgamento?.verdicts.filter(({ verdict }) => verdict !== "yes") ?? []
  if (vereditosDivergentes.length > 0) {
    observacoes.push(`${vereditosDivergentes.length} veredito(s) divergente(s): ${vereditosDivergentes.map(({ id, verdict }) => `${escapeHtml(id.split(":documentos:")[0] ?? id)}=${escapeHtml(verdict)}`).join(", ")}.`)
  }
  if (!observacoes.length) return ""
  return `<details><summary>Ambiguidades e divergências</summary><ul>${observacoes.map((item) => `<li>${item}</li>`).join("")}</ul></details>`
}

function resumoSecao(registro: ProgramaGovernoRevisaoRegistro): string {
  if (!registro.resumo || !registro.geracao || !registro.julgamento) return ""
  const evidenciaLista = (evidencias: readonly ProgramaGovernoRevisaoEvidencia[]) => `<ul>${evidencias.map((item) => `<li><code>${escapeHtml(item.documentoId ?? "?")}</code> p.${item.pagina}: “${escapeHtml(item.trecho)}”</li>`).join("")}</ul>`
  const frases = registro.resumo.frases.map((frase, indice) => `<li><strong>frase:${indice + 1}</strong> ${escapeHtml(frase.texto)}${evidenciaLista(frase.evidencias)}</li>`).join("")
  const temas = registro.resumo.temas.map((tema) => `<li><strong>tema:${escapeHtml(tema.id)}</strong> ${escapeHtml(tema.titulo)}: ${escapeHtml(tema.descricao)}${evidenciaLista(tema.evidencias)}</li>`).join("")
  const vereditos = registro.julgamento.verdicts.map((verdict) => (
    `<tr><td><code>${escapeHtml(verdict.id.split(":documentos:")[0])}</code></td><td>${escapeHtml(verdict.id.split(":documentos:")[1] ?? "")}</td><td>${verdict.verdict === "yes" ? "yes" : `<mark>${escapeHtml(verdict.verdict)}</mark>`}</td><td>${escapeHtml(verdict.reason)}</td></tr>`
  )).join("")
  return `
  <h4>Resumo gerado por IA (rascunho, jamais aprovado)</h4>
  <p>${escapeHtml(registro.resumo.texto)}</p>
  <p class="meta">generator=${escapeHtml(registro.geracao.model)} prompt=${escapeHtml(registro.geracao.promptVersion)} em ${escapeHtml(registro.geracao.generatedAt)} · judge=${escapeHtml(registro.julgamento.model)} rubric=${escapeHtml(registro.julgamento.promptVersion ?? "-")} em ${escapeHtml(registro.julgamento.judgedAt)}</p>
  <details open><summary>Claims e evidências</summary><ol>${frases}</ol><ol>${temas}</ol></details>
  <details open><summary>Resultado do Eval (${registro.julgamento.verdicts.length} itens)</summary>
  <table><thead><tr><th>Claim</th><th>Dimensão</th><th>Veredito</th><th>Motivo</th></tr></thead><tbody>${vereditos}</tbody></table></details>`
}

function alertasSecao(registro: ProgramaGovernoRevisaoRegistro): string {
  const alertas: string[] = []
  if (registro.ingestao?.erro) alertas.push(`Ingestão bloqueada na etapa ${escapeHtml(registro.ingestao.etapa)}: ${escapeHtml(registro.ingestao.erro)}`)
  if (registro.ingestao?.eval && !registro.ingestao.eval.completo) {
    alertas.push(`Eval incompleto: ${registro.ingestao.eval.blockers} veredito(s) no/unknown.`)
  }
  if (!alertas.length) return ""
  return `<div class="alerta"><strong>Alertas:</strong><ul>${alertas.map((item) => `<li>${item}</li>`).join("")}</ul></div>`
}

function cartao(registro: ProgramaGovernoRevisaoRegistro, opcoes: ProgramaGovernoRevisaoOpcoes): string {
  const fonte = registro.fonte
  const rotuloEstado = registro.estado === "em_revisao"
    ? registro.ingestao?.eval?.completo
      ? "Em revisão (Eval completo)"
      : "Em revisão (Eval incompleto, bloqueado)"
    : ESTADO_ROTULO[registro.estado] ?? escapeHtml(registro.estado)
  const resolvido = opcoes.resolverLinkTextoExtraido?.(registro) ?? null
  const linkTexto = fonte.slug && registro.documentos?.length
    ? (resolvido
      ? `<a href="${escapeHtml(resolvido)}">texto extraído (JSON integral)</a>`
      : "<span>texto extraído não disponível neste artefato</span>")
    : "<span>candidatura package-only ou sem documento localizado</span>"
  return `<article class="candidato" data-estado="${escapeHtml(registro.estado)}">
  <header><h3>${escapeHtml(fonte.nomeUrna)} <small>(${escapeHtml(fonte.partido)})</small></h3>
  <span class="estado">${rotuloEstado}</span></header>
  <p class="identidade"><strong>SQ</strong> ${escapeHtml(fonte.sqCandidato)} · <strong>UF</strong> ${escapeHtml(fonte.uf)} · <strong>slug</strong> ${fonte.slug ? escapeHtml(fonte.slug) : "—"} · <strong>chave</strong> <code>2026:${escapeHtml(fonte.cargo)}:${escapeHtml(fonte.uf)}:${escapeHtml(fonte.sqCandidato)}</code></p>
  ${fonteLinha(registro)}
  ${documentosLinha(registro)}
  ${resumoSecao(registro)}
  ${ambiguidadesSecao(registro)}
  ${alertasSecao(registro)}
  <p class="meta">${linkTexto}</p>
  <p class="garantia">Este registro NÃO está aprovado. Publicação depende de decisão humana explícita.</p>
  </article>`
}

export function renderizarProgramaGovernoRevisaoRegional(
  registros: readonly ProgramaGovernoRevisaoRegistro[],
  opcoes: ProgramaGovernoRevisaoOpcoes,
): string {
  assertProgramaGovernoRevisaoSemAprovado(registros)
  const contagem = contarEstadosProgramaGovernoRevisao(registros)
  const resumoEstados = Object.entries(contagem)
    .map(([estado, total]) => `<li>${escapeHtml(ESTADO_ROTULO[estado] ?? estado)}: ${total}</li>`)
    .join("")
  const cartoes = registros.map((registro) => cartao(registro, opcoes)).join("\n")
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opcoes.titulo)}</title><style>
body{font:16px/1.55 system-ui,sans-serif;max-width:1020px;margin:auto;padding:24px;color:#17202a}
header.cabecalho{position:sticky;top:0;background:#fff;border-bottom:2px solid #b91c1c;padding:12px 0}
header.cabecalho strong{color:#b91c1c}
article.candidato{border:1px solid #ccd6dd;border-radius:12px;padding:20px;margin:20px 0;min-width:0;overflow-wrap:anywhere}
article.candidato header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:baseline}
span.estado{white-space:nowrap;border-radius:999px;border:1px solid #94a3b8;padding:2px 10px;font-size:.8rem;font-weight:700}
div.alerta{background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px;margin-top:12px;font-size:.9rem}
table{border-collapse:collapse;display:block;width:100%;max-width:100%;overflow-x:auto;font-size:.82rem;margin-top:8px}
th,td{border:1px solid #d8dee3;padding:4px 6px;text-align:left;vertical-align:top}
p.meta{font-size:.78rem;color:#57606a}code{word-break:break-all}input{max-width:100%}
mark{padding:0 2px}
.garantia{margin-top:14px;font-weight:600;color:#b91c1c}
details{margin:10px 0}ul{margin:6px 0}
@media (max-width:420px){body{padding:12px}article.candidato{padding:14px}}
:focus-visible{outline:2px solid #0f172a;outline-offset:2px}
</style></head><body>
<header class="cabecalho"><strong>NADA NESTE ARTEFATO ESTÁ APROVADO.</strong> Revisão local apenas para auditoria humana.</header>
<main>
<h1>${escapeHtml(opcoes.titulo)}</h1>
<p>Total de candidaturas na região: <strong>${registros.length}</strong></p>
<ul id="resumo-estados">${resumoEstados}</ul>
<p><label for="filtro-busca">Buscar por nome, partido, UF ou SQ:</label> <input id="filtro-busca" type="search" autocomplete="off"></p>
<section data-lista-candidatos>
${cartoes}
</section>
</main>
<script>
(function(){var input=document.getElementById('filtro-busca');if(!input)return;var artigos=Array.prototype.slice.call(document.querySelectorAll('section[data-lista-candidatos] article'));input.addEventListener('input',function(){var q=input.value.trim().toLowerCase();artigos.forEach(function(a){a.hidden=q&&!a.textContent.toLowerCase().includes(q)})})})()
</script></body></html>`
  return html.replace(/^[\t ]+$/gmu, "")
}
