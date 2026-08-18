import { createHash, timingSafeEqual } from "node:crypto"

/** SHA-256 em hex minúsculo — primitive compartilhado (alertas, doadores Fase 2, etc.). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

/**
 * Compara dois segredos em tempo constante (timingSafeEqual), evitando o
 * side-channel de timing do `===`/`!==` em comparação de token/secret.
 * Falha fechada: retorna false se qualquer lado for vazio. Usa o hash SHA-256
 * dos dois lados para que buffers de tamanhos diferentes não vazem o length
 * pelo caminho de erro (timingSafeEqual exige buffers do mesmo tamanho).
 */
export function secretsMatch(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const providedTrimmed = typeof provided === "string" ? provided.trim() : ""
  const expectedTrimmed = typeof expected === "string" ? expected.trim() : ""
  if (!providedTrimmed || !expectedTrimmed) return false
  const providedHash = createHash("sha256").update(providedTrimmed).digest()
  const expectedHash = createHash("sha256").update(expectedTrimmed).digest()
  return timingSafeEqual(providedHash, expectedHash)
}
