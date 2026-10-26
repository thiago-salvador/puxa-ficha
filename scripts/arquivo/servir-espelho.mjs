// Servidor local que imita a hospedagem estática da Vercel para o espelho:
// rewrite do perfil, index.html por pasta, query ignorada e 404.html.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"

const [DIR, PORTA = "4100"] = process.argv.slice(2)
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".csv": "text/csv; charset=utf-8", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain" }

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname)
  if (/^\/api\/candidato-profile\/[^/]+$/.test(p)) p = `${p}/perfil.json`
  const candidatos = [path.join(DIR, p), path.join(DIR, p, "index.html"), path.join(DIR, `${p}.html`)]
  const achado = candidatos.find((c) => fs.existsSync(c) && fs.statSync(c).isFile())
  if (!achado) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" })
    return res.end(fs.existsSync(path.join(DIR, "404.html")) ? fs.readFileSync(path.join(DIR, "404.html")) : "404")
  }
  const ext = path.extname(achado)
  const tipo = p.startsWith("/api/") ? "application/json; charset=utf-8" : tipos[ext] ?? "application/octet-stream"
  res.writeHead(200, { "content-type": tipo })
  fs.createReadStream(achado).pipe(res)
}).listen(Number(PORTA), () => console.log(`espelho em http://localhost:${PORTA}`))
