/**
 * Gate da issue #131: nenhuma escrita em produção fora de `escreverAuditado()`.
 *
 * Roda a política de `scripts/audit/lib/escrita-auditada-gate.ts` sobre o
 * repositório inteiro e fecha a conta em voz alta: os arquivos que o gate acusa
 * têm que ser exatamente os que a política declara como exceção, com o motivo
 * de cada um impresso ao lado. Sobrou acusado sem motivo, reprova; sobrou
 * motivo sem acusado, também reprova, porque lista que descreve um problema já
 * resolvido passa a mentir sobre o repositório.
 *
 * Uso:
 *   npx tsx scripts/audit/check-escrita-auditada.ts
 *   npx tsx scripts/audit/check-escrita-auditada.ts --json
 */

import { auditarRepositorio, RECORTES_AUDITADOS } from "./lib/escrita-auditada-gate"

// Piso de sanidade. O gate cego (varredura que não lê nada e por isso não acusa
// nada) é indistinguível de um repositório limpo, e é o modo de falha mais
// perigoso de qualquer gate deste tipo.
const MINIMO_DE_ARQUIVOS_LIDOS = 200

function main(): void {
  const raiz = process.cwd()
  const auditoria = auditarRepositorio(raiz)
  const comoJson = process.argv.includes("--json")

  if (comoJson) {
    console.log(JSON.stringify(auditoria, null, 2))
  } else {
    console.log(
      `escrita-auditada: ${auditoria.arquivosLidos} arquivo(s) lidos em ` +
        `${RECORTES_AUDITADOS.map((r) => `${r.diretorio}/`).join(" e ")}`,
    )
    console.log(
      `  ${auditoria.auditadas} escrita(s) pelo helper, ${auditoria.isentas} isenta(s) por tabela ` +
        `(trilha, estado de ferramenta, temporária)`,
    )
    console.log(`\nexceções declaradas e confirmadas pela varredura (${auditoria.excecoesConfirmadas.length}):`)
    for (const excecao of auditoria.excecoesConfirmadas) {
      console.log(`  ${excecao.arquivo} (${excecao.sitios} sítio(s))`)
      console.log(`    ${excecao.motivo}`)
    }

    if (auditoria.inadimplentes.length > 0) {
      console.log(`\nINADIMPLENTES (${auditoria.inadimplentes.length}):`)
      for (const arquivo of auditoria.inadimplentes) {
        console.log(`  ${arquivo.arquivo} (${arquivo.sitios} sítio(s))`)
      }
    }

    if (auditoria.excecoesObsoletas.length > 0) {
      console.log(`\nEXCEÇÕES OBSOLETAS (${auditoria.excecoesObsoletas.length}):`)
      for (const excecao of auditoria.excecoesObsoletas) {
        console.log(`  ${excecao.arquivo}`)
      }
    }
  }

  const problemas: string[] = []

  if (auditoria.arquivosLidos < MINIMO_DE_ARQUIVOS_LIDOS) {
    problemas.push(
      `varredura leu só ${auditoria.arquivosLidos} arquivo(s), abaixo do piso de ` +
        `${MINIMO_DE_ARQUIVOS_LIDOS}: isto é gate cego, não repositório limpo`,
    )
  }

  if (auditoria.inadimplentes.length > 0) {
    problemas.push(
      `${auditoria.inadimplentes.length} arquivo(s) escrevem em produção fora de escreverAuditado(): ` +
        `${auditoria.inadimplentes.map((a) => a.arquivo).join(", ")}. ` +
        `Use scripts/lib/escrita-auditada.ts, ou declare a exceção com motivo em RECORTES_AUDITADOS.`,
    )
  }

  if (auditoria.excecoesObsoletas.length > 0) {
    problemas.push(
      `${auditoria.excecoesObsoletas.length} exceção(ões) já não descrevem o repositório: ` +
        `${auditoria.excecoesObsoletas.map((e) => e.arquivo).join(", ")}. Tire da lista.`,
    )
  }

  if (problemas.length > 0) {
    console.error(`\nescrita-auditada: REPROVOU`)
    for (const problema of problemas) console.error(`  - ${problema}`)
    process.exit(1)
  }

  console.log(
    `\nescrita-auditada: a conta fecha. ${auditoria.excecoesConfirmadas.length} acusado(s), ` +
      `${auditoria.excecoesConfirmadas.length} exceção(ões) declarada(s), zero inadimplente.`,
  )
}

main()
