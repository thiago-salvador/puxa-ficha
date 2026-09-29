import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)))

/**
 * Caminho real: resolve links simbólicos no ancestral mais próximo que existe e
 * recoloca os segmentos que ainda não existem. Sem isso, um link fora do
 * repositório que aponta para dentro dele passaria na comparação textual.
 */
function caminhoReal(path: string): string {
  const absoluto = resolve(path)
  const pendentes: string[] = []
  let atual = absoluto
  while (!existsSync(atual)) {
    const pai = dirname(atual)
    if (pai === atual) return absoluto
    pendentes.unshift(basename(atual))
    atual = pai
  }
  return join(realpathSync(atual), ...pendentes)
}

/**
 * Bytes oficiais brutos e caches de coleta nunca ficam no repositório público.
 * Aceita qualquer pasta fora da árvore do repositório e devolve o caminho absoluto.
 * A comparação usa o caminho real dos dois lados (links simbólicos resolvidos).
 */
export function assertOutsideRepository(path: string, label: string, root = REPO_ROOT): string {
  const target = resolve(path)
  const fromRoot = relative(caminhoReal(root), caminhoReal(target))
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error(`${label} precisa ficar fora do repositório`)
  }
  return target
}
