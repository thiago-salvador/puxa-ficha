// Network-only: never persist electoral data, alert tokens, API or HTML responses.
// Versão 2026-09-30 (aviso no design system). Sem CacheStorage: o navegador troca o
// worker pela diferença de bytes, e o registro usa updateViaCache "none".
const offlineNotice = `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão | Puxa Ficha</title>
<style>body{margin:0;background:#0a0a0a;color:#ffffff;font:18px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}main{max-width:38rem;margin:15vh auto;padding:24px}.marca{margin:0;font-family:Anton,Impact,"Arial Narrow",sans-serif;font-size:20px;letter-spacing:.04em;text-transform:uppercase}h1{margin:.3em 0 .4em;font-family:Anton,Impact,"Arial Narrow",sans-serif;font-weight:400;font-size:clamp(3rem,12vw,5.5rem);line-height:.9;text-transform:uppercase}main>p:not(.marca){color:#a3a3a3}a{color:#ffffff;font-weight:700;text-underline-offset:3px}</style>
</head><body><main><p class="marca">Puxa Ficha</p><h1>Sem conexão</h1>
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
