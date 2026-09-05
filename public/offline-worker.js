// Network-only: never persist electoral data, alert tokens, API or HTML responses.
const offlineNotice = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão | Puxa Ficha</title>
<style>body{margin:0;background:#0a0a0a;color:#fafafa;font:18px/1.6 system-ui,sans-serif}main{max-width:38rem;margin:15vh auto;padding:24px}a{color:#baff00}h1{line-height:1.2}</style>
</head><body><main><p>Puxa Ficha</p><h1>Sem conexão</h1>
<p>Conecte-se à internet para consultar as fichas atualizadas. Não guardamos uma cópia dos dados para consulta offline.</p>
<p><a href="">Tentar novamente</a></p></main></body></html>`

self.addEventListener("fetch", (event) => {
  const request = event.request
  const pathname = new URL(request.url).pathname
  if (request.method !== "GET" || request.mode !== "navigate" || pathname === "/api" || pathname.startsWith("/api/")) return

  event.respondWith(fetch(request, { cache: "no-store" }).catch(() => new Response(offlineNotice, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  })))
})
