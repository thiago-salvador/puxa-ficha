import { registerHooks } from "node:module"

// O gerador da Fase 4 executa o carregador canônico do servidor via Node/tsx.
// `server-only` é um marcador de bundler, não uma dependência de runtime.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { shortCircuit: true, url: "pf-audit:server-only" }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url === "pf-audit:server-only") {
      return { format: "module", shortCircuit: true, source: "export {}" }
    }
    return nextLoad(url, context)
  },
})
