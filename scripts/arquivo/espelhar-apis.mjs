// Espelha as APIs que a ficha busca no navegador, por slug, como arquivos.
// Uso: node espelhar-apis.mjs <origem> <pasta-destino>
import fs from "node:fs"
import path from "node:path"

const [ORIGEM, DEST] = process.argv.slice(2)
const relatorio = { ok: 0, vazio: 0, falhas: [] }
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

// Uma fila por rota limitada (60/min no servidor): no máximo 1 chamada por segundo em cada.
function criarRitmo(intervaloMs) {
  let proxima = 0
  return async () => {
    const agora = Date.now()
    const vez = Math.max(agora, proxima)
    proxima = vez + intervaloMs
    if (vez > agora) await espera(vez - agora)
  }
}
const ritmo = { perfil: criarRitmo(250), leg: criarRitmo(250), programa: criarRitmo(1100), projetos: criarRitmo(1100), noticias: criarRitmo(1100) }

async function obter(url, fila) {
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    await ritmo[fila]()
    const r = await fetch(ORIGEM + url)
    if (r.status === 429) { await espera(5000 * (tentativa + 1)); continue }
    if (!r.ok) return { status: r.status }
    return { status: r.status, json: await r.json() }
  }
  return { status: 429 }
}

// O perfil (/api/candidato-profile/<slug>) também é pasta das seções: vai para
// <slug>/perfil.json, e o vercel.json do projeto estático reescreve o caminho.
function arquivoDe(url) {
  return /^\/api\/candidato-profile\/[^/]+$/.test(url) ? `${url}/perfil.json` : url
}

function gravar(url, corpo) {
  const arquivo = path.join(DEST, arquivoDe(url))
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  fs.writeFileSync(arquivo, JSON.stringify(corpo))
  relatorio.ok++
}

function acharCampo(obj, chave) {
  if (!obj || typeof obj !== "object") return null
  if (typeof obj[chave] === "string") return obj[chave]
  for (const v of Object.values(obj)) { const achado = acharCampo(v, chave); if (achado) return achado }
  return null
}

async function espelharSlug(slug) {
  const base = `/api/candidato-profile/${slug}`
  const simples = [[base, "perfil"], [`${base}/legislacao-executivo`, "leg"], [`${base}/programa`, "programa"]]
  let programa = null
  await Promise.all(simples.map(async ([url, fila]) => {
    const r = await obter(url, fila)
    if (r.json && fila === "programa") programa = r.json
    if (r.json) gravar(url, r.json)
    else if (r.status === 404) relatorio.vazio++
    else relatorio.falhas.push(`${r.status} ${url}`)
  }))

  // Programa de governo: o documento inteiro num arquivo, no caminho que o build estático lê.
  for (const doc of programa?.data?.documentos ?? []) {
    const secoes = []
    let cursor = null
    for (let i = 0; i <= doc.secoes; i++) {
      const q = new URLSearchParams({ documentoId: doc.documentoId })
      if (cursor) q.set("cursor", cursor)
      const r = await obter(`${base}/programa?${q}`, "programa")
      const chunk = r.json?.chunk
      if (!chunk) { relatorio.falhas.push(`${r.status} ${base}/programa doc ${doc.documentoId}`); break }
      secoes.push(...chunk.secoes)
      if (chunk.completo) break
      cursor = chunk.nextCursor
    }
    if (secoes.length === doc.secoes) {
      gravar(`${base}/programa-documento/${Buffer.from(doc.documentoId).toString("base64url")}.json`, {
        documentoId: doc.documentoId, sourceSha256: doc.sourceSha256, extractedTextSha256: doc.extractedTextSha256, secoes,
      })
    }
  }

  // Projetos de lei: junta todas as páginas num arquivo só; o cliente fecha o laço numa requisição.
  const linhas = []
  let total = Infinity
  for (let offset = 0; offset < total;) {
    const r = await obter(`${base}/projetos-lei?offset=${offset}&limit=100`, "projetos")
    if (!r.json?.data) { if (r.status !== 404) relatorio.falhas.push(`${r.status} ${base}/projetos-lei@${offset}`); break }
    total = r.json.data.total ?? r.json.data.rows.length
    linhas.push(...r.json.data.rows)
    if (r.json.data.rows.length === 0) break
    offset += r.json.data.rows.length
  }
  if (linhas.length) gravar(`${base}/projetos-lei`, { data: { rows: linhas, total: linhas.length } })

  // Notícias: o cursor inicial vem no JSON da ficha (noticias_cursor); o arquivo traz o resto e nextCursor nulo.
  const perfil = fs.existsSync(path.join(DEST, arquivoDe(base))) ? JSON.parse(fs.readFileSync(path.join(DEST, arquivoDe(base)), "utf8")) : null
  let cursor = acharCampo(perfil, "noticias_cursor")
  const restantes = []
  let totalNoticias = 0
  while (cursor) {
    const r = await obter(`${base}/noticias?cursor=${encodeURIComponent(cursor)}`, "noticias")
    if (!r.json) { relatorio.falhas.push(`${r.status} ${base}/noticias`); break }
    restantes.push(...r.json.data)
    totalNoticias = r.json.total
    cursor = r.json.nextCursor
  }
  if (restantes.length) gravar(`${base}/noticias`, { data: restantes, nextCursor: null, total: totalNoticias })
}

async function main() {
  const { slugs } = await (await fetch(`${ORIGEM}/api/candidato-slugs`)).json().then((j) => ({ slugs: Array.isArray(j) ? j : j.slugs ?? j.data }))
  console.log(`slugs: ${slugs.length}`)
  let n = 0
  const fila = [...slugs]
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (fila.length) {
      const slug = typeof fila[0] === "string" ? fila.shift() : fila.shift().slug
      await espelharSlug(slug)
      if (++n % 50 === 0) console.log(`fichas ${n}/${slugs.length} arquivos ${relatorio.ok} falhas ${relatorio.falhas.length}`)
    }
  }))
  fs.writeFileSync(path.join(DEST, "_relatorio-apis.json"), JSON.stringify(relatorio, null, 2))
  console.log(`fim: ${relatorio.ok} arquivos, ${relatorio.vazio} vazios, ${relatorio.falhas.length} falhas`)
}

main()
