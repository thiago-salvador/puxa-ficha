import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const root = new URL("..", import.meta.url)
const page = readFileSync(new URL("src/app/(site)/colinha/page.tsx", root), "utf8")
const builder = readFileSync(new URL("src/components/ColinhaBuilder.tsx", root), "utf8")

test("colinha é privada para indexação e referrer", () => {
  assert.match(page, /index: false/)
  assert.match(page, /referrer: ["']no-referrer["']/)
})

test("colinha usa estado na URL, seis slots e history.replaceState", () => {
  assert.match(builder, /parseColinhaState/)
  assert.match(builder, /buildColinhaUrl/)
  assert.match(builder, /history\.replaceState/)
  for (const slot of ["df", "de", "s1", "s2", "g", "p"]) assert.match(builder, new RegExp(`SLOT_ORDER|${slot}`))
  assert.match(builder, /s1.*s2|s2.*s1/)
})

test("colinha consulta a API oficial, oferece compartilhamento e marca parcial", () => {
  assert.match(builder, /\/api\/colinha\/candidatos/)
  assert.match(builder, /\/api\/colinha\/card/)
  assert.match(builder, /WhatsApp/)
  assert.match(builder, /Imprimir A4/)
  assert.match(builder, /Fonte indisponível/)
  assert.match(builder, /Snapshot indisponível ou sem data de geração/)
  assert.match(builder, /colinhaShare/)
  assert.match(builder, /safeEvent\("text"\)/)
  assert.match(builder, /colinha-print-sheet/)
  assert.match(builder, /@media print/)
  assert.match(builder, /imageAlt/)
  assert.match(builder, /resumo/)
})

test("nenhuma rota ou lib compartilhada da colinha foi alterada pela UI", () => {
  assert.doesNotMatch(builder, /colinha-data/)
  assert.doesNotMatch(builder, /colinha-card/)
})

test("resultados mantêm ficha publicada fora do botão de seleção", () => {
  assert.match(builder, /<li key=\{candidate\.sq_candidato\} className=.*<button/)
  assert.match(builder, /candidate\.slug && <Link href=\{`\/candidato\//)
  assert.doesNotMatch(builder, /<button[^>]*>[\s\S]{0,300}<Link/)
  assert.match(builder, /Candidatura não encontrada neste snapshot/)
  assert.match(builder, /Escolha indisponível:/)
})

test("patrimônio usa o formatador monetário compartilhado do site, não toLocaleString cru", () => {
  assert.match(builder, /import \{ formatBRL \} from "@\/lib\/utils"/)
  assert.match(builder, /Patrimônio: \$\{formatBRL\(candidate\.resumo\.patrimonio\)\}/)
  assert.doesNotMatch(builder, /patrimonio\.toLocaleString/)
})

test("fluxo guiado: estado primeiro, um cargo por passo na ordem da urna, conferência no fim", () => {
  assert.match(builder, /Em que estado você vota\?/)
  assert.match(builder, /const activeSlots = useMemo\(/)
  assert.match(builder, /const reviewIndex = activeSlots\.length/)
  assert.match(builder, /Voto \{step \+ 1\} de \{activeSlots\.length\}/)
  assert.match(builder, /aria-current=\{current \? "step" : undefined\}/)
  assert.match(builder, /Pular este voto/)
  // escolher avança sozinho para o próximo voto vazio, ou para a conferência
  assert.match(builder, /goTo\(after === -1 \? reviewIndex : after\)/)
  // cada troca de passo leva o painel para a vista e o foco para o título
  assert.match(builder, /scrollIntoView/)
  assert.match(builder, /headingRef\.current\?\.focus/)
})

test("lista do cargo carrega sozinha ao entrar no passo e filtra enquanto digita, sem botão Buscar", () => {
  assert.match(builder, /action: "search", uf: state\.uf, slot, query: debouncedQuery\.trim\(\)/)
  assert.match(builder, /\[mounted, state\.uf, slot, state\.turno, debouncedQuery, retry, secondRoundActive\]/)
  assert.match(builder, /AbortController/)
  assert.doesNotMatch(builder, />Buscar<\/button>/)
  assert.match(builder, /Tentar de novo/)
})

test("candidaturas bloqueadas ficam escondidas por padrão, com opção de mostrar", () => {
  assert.match(builder, /const visible = showBlocked \? \[\.\.\.allowed, \.\.\.blocked\] : allowed/)
  assert.match(builder, /com registro indeferido, renúncia ou cassação/)
})

test("sem escolhas não há consulta de seleção, então o aviso de parcial não aparece antes da hora", () => {
  assert.match(builder, /if \(!mounted \|\| !state\.uf \|\| \(state\.turno === 2 && !round\) \|\| !SLOT_ORDER\.some\(\(id\) => state\[id\]\)\) return/)
})

test("compartilhar só aparece na conferência e com pelo menos um voto", () => {
  assert.match(builder, /filled === 0 \? <p[^>]*>Escolha pelo menos um voto/)
  assert.match(builder, /aria-label=\{`\$\{picked \? "Trocar" : "Escolher"\} candidato para \$\{SLOT_LABELS\[id\]\}`\}/)
})

test("estado do snapshot vem de describeSnapshotStatus, nunca de uma frase montada na hora com o valor bruto", () => {
  assert.match(builder, /import \{[\s\S]{0,600}describeSnapshotStatus[\s\S]{0,600}\} from "@\/lib\/colinha"/)
  assert.match(builder, /\{snapshotCopy\.message\} Confira novamente antes de votar\./)
  assert.match(builder, /\{snapshotCopy\.showPartialWarning &&/)
  assert.doesNotMatch(builder, /Situação consultada no snapshot de \{formatDate\(snapshot\)\}/)
  assert.doesNotMatch(builder, /\(unavailable \|\| !snapshot\)/)
})

test("guia de votação segue o Manual do Eleitor do TSE: ordem, dígitos e dois senadores distintos, em texto e na impressão", async () => {
  const { SLOT_DIGITS, SLOT_ORDER, VOTING_GUIDE_SOURCE_URL } = await import("../src/lib/colinha")
  assert.deepEqual([...SLOT_ORDER], ["df", "de", "s1", "s2", "g", "p"])
  assert.deepEqual(SLOT_DIGITS, { df: 4, de: 5, s1: 3, s2: 3, g: 2, p: 2 })
  assert.match(VOTING_GUIDE_SOURCE_URL, /^https:\/\/www\.tse\.jus\.br\//)
  assert.match(builder, /<ol[^>]*>\{\[\.\.\.activeSlots, "conferir" as const\]\.map/)
  assert.match(builder, /não é a tela da urna/)
  assert.match(builder, /dois votos para senador precisam ser em candidatos diferentes/)
  assert.match(builder, /formatSlotDigits\(slot\)\} na urna/)
  assert.match(builder, /colinha-print-choice[\s\S]*formatSlotDigits\(id\)/)
  assert.match(builder, /segundo senador \(outro candidato\)/)
})

test("conferência avisa que celular não entra na cabine e põe a impressão em primeiro plano", () => {
  assert.match(builder, /Celular não entra na cabine de votação/)
  assert.match(builder, /Lei 9\.504\/1997, art\. 91-A/)
  assert.match(builder, /planalto\.gov\.br\/ccivil_03\/leis\/l9504\.htm/)
  const leve = builder.slice(builder.indexOf('id="colinha-levar"'))
  assert.ok(leve.indexOf("Imprimir A4") < leve.indexOf("Gerar imagem para feed"), "Imprimir vem antes das imagens")
})

test("lista sem filtro explica a ordem rotativa com a letra que veio do servidor", () => {
  assert.match(builder, /setListStart\(payload\.listStart \?\? null\)/)
  assert.match(builder, /Agora a lista começa pela letra \{listStart\}/)
})

test("2º turno explica cargos já decididos durante a escolha e atualiza o hero", () => {
  assert.match(builder, /secondRoundActive && round\?\.message && <p/)
  assert.match(builder, /data-colinha-hero/)
  assert.match(builder, /heroCopy\.textContent = `2º turno\./)
})
