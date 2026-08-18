import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const PATH = join(
  import.meta.dirname,
  "..",
  "QA/evidencias/2026-08-10-item4-14-destaques/auditoria-fontes-32.json",
)

interface CadastroSancao {
  resultado: string
}

interface FichaEvidencia {
  slug: string
  fontes: {
    sancoes: {
      consulta_externa: boolean
      resultado: string
      por_cadastro?: CadastroSancao[]
    }
    patrimonio: { resultado: string }
  }
}

test("evidência externa fecha o universo de 32 sem vazar CPF nem inventar vazio", () => {
  const bruto = readFileSync(PATH, "utf8")
  const relatorio = JSON.parse(bruto)

  assert.equal(relatorio.universo, 32)
  assert.equal(relatorio.fichas.length, 32)
  assert.equal(new Set(relatorio.fichas.map((item: { slug: string }) => item.slug)).size, 32)
  assert.doesNotMatch(bruto, /"cpf"\s*:/i)
  assert.doesNotMatch(bruto, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)

  assert.deepEqual(relatorio.resumo.sancoes, { erro: 25, vazio_confirmado: 7 })
  assert.deepEqual(relatorio.resumo.trajetoria, {
    bloqueio_identidade_sem_sq: 24,
    sem_achado_no_escopo: 8,
  })
  assert.deepEqual(relatorio.resumo.processos, {
    bloqueio_editorial: 24,
    erro_divergencia_encontrado_sem_card: 2,
    indeterminado: 6,
  })
  assert.deepEqual(relatorio.resumo.patrimonio, {
    bloqueio_identidade_sem_sq: 24,
    encontrado: 3,
    indeterminado: 5,
  })
  assert.deepEqual(relatorio.resumo.votacoes, {
    bloqueio_identidade_sem_id_legislativo: 32,
  })

  const fichas = relatorio.fichas as FichaEvidencia[]
  const consultasCgu = fichas.filter(
    (item) => item.fontes.sancoes.consulta_externa,
  )
  assert.equal(consultasCgu.length, 7)
  assert.ok(consultasCgu.every((item) => item.fontes.sancoes.resultado === "vazio_confirmado"))
  assert.ok(
    consultasCgu.every((item) =>
      (item.fontes.sancoes.por_cadastro ?? []).every(
        (cadastro) => cadastro.resultado === "vazio_confirmado",
      ),
    ),
  )

  const porSlug = new Map(fichas.map((item) => [item.slug, item]))
  for (const slug of ["andre-marinho", "jose-estevao", "samara-mineiro"]) {
    assert.equal(porSlug.get(slug)?.fontes.patrimonio.resultado, "encontrado")
  }
  for (const slug of ["dr-luisinho", "preta-lu"]) {
    assert.equal(porSlug.get(slug)?.fontes.patrimonio.resultado, "indeterminado")
  }

  assert.equal(relatorio.fontes_externas.tse_pacotes.length, 6)
  for (const pacote of relatorio.fontes_externas.tse_pacotes) {
    assert.match(pacote.consultaCand.sha256, /^[a-f0-9]{64}$/)
    assert.match(pacote.bemCandidato.sha256, /^[a-f0-9]{64}$/)
    assert.ok(pacote.consultaCand.bytes > 0)
    assert.ok(pacote.bemCandidato.bytes > 0)
  }
})
