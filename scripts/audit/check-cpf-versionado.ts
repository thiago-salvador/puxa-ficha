/**
 * Gate: nenhum CPF válido em contexto explícito em arquivo versionado.
 *
 * A política mora em `scripts/audit/lib/cpf-versionado-gate.ts`. A saída
 * nunca mostra o número, só arquivo, linha e o tipo de contexto, porque o log
 * do CI é tão público quanto o repositório.
 *
 * Uso:
 *   npx tsx scripts/audit/check-cpf-versionado.ts
 */

import { auditarCpfVersionado, MARCADOR_CPF_REMOVIDO } from "./lib/cpf-versionado-gate"

// Piso de sanidade: varredura que não lê nada é indistinguível de repositório
// limpo. O repositório tem milhares de arquivos de texto rastreados.
const MINIMO_DE_ARQUIVOS_LIDOS = 1000

function main(): void {
  const resultado = auditarCpfVersionado(process.cwd())
  console.log(
    `cpf-versionado: ${resultado.arquivosLidos} arquivo(s) de texto lidos, ` +
      `${resultado.binariosIgnorados} binário(s) fora da varredura`,
  )

  const problemas: string[] = []
  if (resultado.arquivosLidos < MINIMO_DE_ARQUIVOS_LIDOS) {
    problemas.push(
      `varredura leu só ${resultado.arquivosLidos} arquivo(s), abaixo do piso de ` +
        `${MINIMO_DE_ARQUIVOS_LIDOS}: isto é gate cego, não repositório limpo`,
    )
  }
  if (resultado.achados.length > 0) {
    console.log(`\nCPF em arquivo versionado (${resultado.achados.length}):`)
    for (const achado of resultado.achados) {
      console.log(`  ${achado.arquivo}:${achado.linha}:${achado.coluna} (${achado.contexto})`)
    }
    problemas.push(
      `${resultado.achados.length} CPF(s) válido(s) em contexto explícito. Troque o valor por ` +
        `"${MARCADOR_CPF_REMOVIDO}" ou, em teste, por valor sintético da lista de ` +
        `scripts/audit/lib/cpf-versionado-gate.ts. Nunca por hash do CPF: 11 dígitos sem sal se revertem.`,
    )
  }

  if (problemas.length > 0) {
    console.error(`\nFALHA:\n- ${problemas.join("\n- ")}`)
    process.exitCode = 1
    return
  }
  console.log("CPF_VERSIONADO_PASS")
}

main()
