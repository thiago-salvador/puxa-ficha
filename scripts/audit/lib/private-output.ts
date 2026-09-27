import { isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)))

/**
 * Bytes oficiais brutos e caches de coleta nunca ficam no repositório público.
 * Aceita qualquer pasta fora da árvore do repositório e devolve o caminho absoluto.
 */
export function assertOutsideRepository(path: string, label: string, root = REPO_ROOT): string {
  const target = resolve(path)
  const fromRoot = relative(root, target)
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error(`${label} precisa ficar fora do repositório`)
  }
  return target
}
