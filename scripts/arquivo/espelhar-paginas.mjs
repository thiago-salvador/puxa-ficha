// Espelha o Puxa Ficha (servidor local de produção) em arquivos estáticos.
// Uso: node espelhar.mjs <origem> <pasta-destino> <repo>
// Fase 1: páginas e downloads. Fase 2: imagens (Wikimedia direto da fonte, devagar).
// As imagens vêm do loader do modo estático: /_img/<hash>.<ext>?o=<origem>.
import fs from "node:fs"
import path from "node:path"

const [ORIGEM, DEST, REPO] = process.argv.slice(2)
const UA = "PuxaFichaArquivo/1.0 (+https://puxaficha.com.br/sobre)"
const fila = []
const feitos = new Set()
const paginas = new Map() // caminho -> arquivo html
const refsImagem = new Set() // como aparecem no HTML (com &amp;)
const downloads = new Set()
const falhas = []
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

// Cópia exata de src/lib/arquivo.ts (hashImagem + arquivoImagemLocal).
function hashImagem(texto) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
function arquivoImagemLocal(src) {
  const ext = src.split("?")[0].match(/\.(jpe?g|png|webp|gif|svg|avif)$/i)?.[1].toLowerCase().replace("jpeg", "jpg") ?? "img"
  return `/_img/${hashImagem(src)}.${ext}?o=${encodeURIComponent(src)}`
}

function enfileirar(p) {
  if (!p.startsWith("/") || p.startsWith("//")) return
  const limpo = p.split("#")[0].split("?")[0]
  if (!limpo || limpo.startsWith("/api/") || limpo.startsWith("/_next/") || limpo.startsWith("/arquivo-dados/") || /\.[a-z0-9]{2,5}$/i.test(limpo)) return
  if (feitos.has(limpo)) return
  feitos.add(limpo)
  fila.push(limpo)
}

function destinoHtml(p) {
  return path.join(DEST, p === "/" ? "index.html" : `${p.replace(/\/$/, "")}/index.html`)
}

// Temporário e rename: arquivo truncado por uma queda não fica no lugar, e a fase 2 o refaz.
function gravarAtomico(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true })
  const tmp = `${arquivo}.tmp-${process.pid}`
  fs.writeFileSync(tmp, conteudo)
  fs.renameSync(tmp, arquivo)
}

async function baixar(url, arquivo, { externo = false, tentativas = 3, aceitar404 = false } = {}) {
  let r
  for (let t = 0; t < tentativas; t++) {
    r = await fetch(externo ? url : ORIGEM + url, { redirect: externo ? "follow" : "manual", headers: externo ? { "user-agent": UA } : {}, signal: AbortSignal.timeout(60_000) })
    if (r.status !== 429) break
    await espera(externo ? 30000 : 4000 * (t + 1))
  }
  if (r.status >= 300 && r.status < 400) return { redirect: r.headers.get("location"), status: r.status }
  // A página 404 é capturada pelo corpo da própria resposta de erro.
  if (!r.ok && !(aceitar404 && r.status === 404)) return { status: r.status }
  const buf = Buffer.from(await r.arrayBuffer())
  if (arquivo) gravarAtomico(arquivo, buf)
  return { status: r.status, buf, tipo: r.headers.get("content-type") || "" }
}

async function processarPagina(p) {
  const r = await baixar(p)
  if (r.redirect) {
    const alvo = new URL(r.redirect, ORIGEM).pathname
    gravarAtomico(destinoHtml(p), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${alvo}"><link rel="canonical" href="${alvo}">`)
    enfileirar(alvo)
    return
  }
  if (!r.buf) { falhas.push(`pagina ${r.status} ${p}`); return }
  const html = r.buf.toString("utf8")
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) enfileirar(m[1])
  for (const m of html.matchAll(/\/arquivo-dados\/[A-Za-z0-9_-]+\.(?:csv|json)/g)) downloads.add(m[0])
  for (const m of html.matchAll(/\/_img\/([a-z0-9]+\.[a-z]+)\?o=([^"'\s,)\\&]+)/g)) refsImagem.add(`${m[1]} ${decodeURIComponent(m[2])}`)
  gravarAtomico(destinoHtml(p), html)
  paginas.set(p, destinoHtml(p))
}

async function main() {
  fs.mkdirSync(path.join(DEST, "_img"), { recursive: true })
  const sitemap = (await baixar("/sitemap.xml")).buf.toString("utf8")
  for (const m of sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)) enfileirar(m[1] || "/")
  enfileirar("/")
  let n = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (fila.length) {
      const p = fila.shift()
      try { await processarPagina(p) } catch (e) { falhas.push(`pagina erro ${p} ${e.message}`) }
      if (++n % 200 === 0) console.log(`páginas ${n} fila ${fila.length}`)
    }
  }))
  console.log(`fase 1: ${paginas.size} páginas, ${refsImagem.size} referências de imagem, ${downloads.size} downloads`)

  // Fase 2: imagens. Além do HTML, as URLs de imagem dentro dos JSON da ficha.
  const apiDir = path.join(DEST, "api")
  const pilha = fs.existsSync(apiDir) ? [apiDir] : []
  while (pilha.length) {
    const atual = pilha.pop()
    for (const e of fs.readdirSync(atual, { withFileTypes: true })) {
      const caminho = path.join(atual, e.name)
      if (e.isDirectory()) { pilha.push(caminho); continue }
      const texto = fs.readFileSync(caminho, "utf8")
      for (const m of texto.matchAll(/https?:\/\/[^"\s]+?\.(?:jpe?g|png|webp|gif|svg|avif)(?:\?[^"\s]*)?(?=")/gi)) {
        refsImagem.add(`${arquivoImagemLocal(m[0]).slice(6).split("?")[0]} ${m[0]}`)
      }
    }
  }
  const alvos = new Map([...refsImagem].map((r) => { const i = r.indexOf(" "); return [r.slice(0, i), r.slice(i + 1)] }))
  const wikimedia = [...alvos].filter(([, o]) => o.startsWith("https://upload.wikimedia.org/"))
  const outras = [...alvos].filter(([, o]) => !o.startsWith("https://upload.wikimedia.org/"))
  let ok = 0
  async function pegar([nome, origem], externo) {
    const arquivo = path.join(DEST, "_img", nome)
    if (fs.existsSync(arquivo)) { ok++; return }
    const falhou = (e) => ({ status: `erro ${e.name}` })
    let r = await baixar(origem, arquivo, { externo, tentativas: 5 }).catch(falhou)
    // Reserva: o otimizador da produção guarda em cache a versão que o site já serviu.
    if (!r.buf) r = await baixar(`https://puxaficha.com.br/_next/image?url=${encodeURIComponent(origem)}&w=640&q=75`, arquivo, { externo: true, tentativas: 2 }).catch(falhou)
    if (r.buf) ok++
    else falhas.push(`img ${r.status} ${origem.slice(0, 120)}`)
  }
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (outras.length) await pegar(outras.shift(), true)
  }))
  let k = 0
  for (const alvo of wikimedia) {
    if (!fs.existsSync(path.join(DEST, "_img", alvo[0]))) await espera(1200)
    await pegar(alvo, true)
    if (++k % 50 === 0) console.log(`wikimedia ${k}/${wikimedia.length}`)
  }
  console.log(`fase 2: ${ok} imagens de ${alvos.size}`)

  fs.rmSync(path.join(DEST, "_next"), { recursive: true, force: true })
  fs.cpSync(path.join(REPO, ".next/static"), path.join(DEST, "_next/static"), { recursive: true })
  fs.cpSync(path.join(REPO, "public"), DEST, { recursive: true })
  for (const extra of ["/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/favicon.ico", "/opengraph-image"]) {
    const r = await baixar(extra, path.join(DEST, extra)).catch((e) => ({ status: `erro ${e.name}` }))
    if (!r.buf) falhas.push(`extra ${r.status} ${extra}`)
  }
  const naoExiste = await baixar("/pagina-que-nao-existe-arquivo", null, { aceitar404: true })
  if (naoExiste.buf) gravarAtomico(path.join(DEST, "404.html"), naoExiste.buf)
  else falhas.push(`404 ${naoExiste.status} sem corpo`)
  for (const d of downloads) {
    const original = Buffer.from(d.split("/").pop().replace(/\.(csv|json)$/, ""), "base64url").toString("utf8")
    const r = await baixar(original, path.join(DEST, d)).catch((e) => ({ status: `erro ${e.name}` }))
    if (!r.buf) falhas.push(`download ${r.status} ${original}`)
  }
  const indice = await baixar("/api/search-index", path.join(DEST, "api/search-index")).catch((e) => ({ status: `erro ${e.name}` }))
  if (!indice.buf) falhas.push(`busca ${indice.status} /api/search-index`)
  fs.writeFileSync(path.join(DEST, "_relatorio.json"), JSON.stringify({ paginas: paginas.size, imagens: ok, refs: refsImagem.size, downloads: downloads.size, falhas }, null, 2))
  console.log(`fim: ${paginas.size} páginas, ${ok}/${refsImagem.size} imagens, ${downloads.size} downloads, ${falhas.length} falhas`)
}

main()
