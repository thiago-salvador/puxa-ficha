/**
 * UF escolhida pela pessoa, guardada só neste navegador. A mesma chave do
 * índice de governadores (`StatePreference`): escolher o estado num lugar vale
 * no outro. Toda leitura e escrita tolera armazenamento bloqueado.
 */
import { BRAZIL_STATES } from "@/data/brazil-states"

export const MEU_ESTADO_CHAVE = "pf-governadores-uf"
/** Evento disparado na mesma aba quando a UF muda (o "storage" só chega às outras abas). */
export const MEU_ESTADO_EVENTO = "pf-governadores-uf-change"

type Armazenamento = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** `window.localStorage` sem lançar: o próprio acesso falha com o armazenamento bloqueado. */
export function armazenamentoLocal(): Armazenamento | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

function ufValida(uf: string | null | undefined): uf is string {
  return BRAZIL_STATES.some((state) => state.sigla === uf)
}

/** UF salva, em maiúscula; null sem armazenamento, sem valor ou com valor que não é UF. */
export function lerUfSalva(storage: Armazenamento | null | undefined): string | null {
  try {
    const uf = storage?.getItem(MEU_ESTADO_CHAVE)?.toUpperCase() ?? null
    return ufValida(uf) ? uf : null
  } catch {
    return null
  }
}

/** Grava a UF (ou apaga com null). Devolve false quando o navegador recusa ou a UF não existe. */
export function salvarUf(storage: Armazenamento | null | undefined, uf: string | null): boolean {
  if (!storage) return false
  try {
    if (uf === null) {
      storage.removeItem(MEU_ESTADO_CHAVE)
      return true
    }
    const sigla = uf.toUpperCase()
    if (!ufValida(sigla)) return false
    storage.setItem(MEU_ESTADO_CHAVE, sigla)
    return true
  } catch {
    return false
  }
}

/** A UF escolhida vai para o topo; o resto mantém a ordem recebida. */
export function ordenarComMeuEstado<T extends { uf: string }>(itens: readonly T[], uf: string | null): T[] {
  if (!uf) return [...itens]
  const alvo = uf.toUpperCase()
  const escolhido = itens.filter((i) => i.uf.toUpperCase() === alvo)
  return [...escolhido, ...itens.filter((i) => i.uf.toUpperCase() !== alvo)]
}
