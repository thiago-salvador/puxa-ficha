import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  TSE_CSV_DONOR_DOCUMENT_COLUMN_KEYS,
  digitsOnly,
  extractOptionalDonorIdsFromTseRow,
  hashCpfForDonorStorage,
  normalizeCnpjStorageDigits,
  pickRawDonorDocumentFromTseRow,
} from "@/lib/financiamento-doador-identifiers"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function parseTseReceitasHeaderLine(line: string): string[] {
  return line
    .trim()
    .split(";")
    .map((cell) => cell.replace(/^"|"$/g, "").trim())
}

describe("pickRawDonorDocumentFromTseRow", () => {
  it("usa primeira coluna conhecida não vazia", () => {
    assert.equal(
      pickRawDonorDocumentFromTseRow({
        NM_DOADOR: "X",
        NR_CPF_CNPJ_DOADOR: "12.345.678/0001-90",
      }),
      "12.345.678/0001-90"
    )
  })

  it("ignora #NULO#", () => {
    assert.equal(
      pickRawDonorDocumentFromTseRow({
        NR_CPF_CNPJ_DOADOR: "#NULO#",
        NR_DOCUMENTO_DOADOR: "12345678000190",
      }),
      "12345678000190"
    )
  })

  it("aceita coluna legada CPF/CNPJ do doador (2010–2016)", () => {
    assert.equal(
      pickRawDonorDocumentFromTseRow({
        "CPF/CNPJ do doador": "12.345.678/0001-90",
      }),
      "12.345.678/0001-90"
    )
  })
})

describe("normalizeCnpjStorageDigits / digitsOnly", () => {
  it("CNPJ 14 dígitos válido", () => {
    assert.equal(normalizeCnpjStorageDigits(digitsOnly("12.345.678/0001-90")), "12345678000190")
  })

  it("11 dígitos não é CNPJ", () => {
    assert.equal(normalizeCnpjStorageDigits(digitsOnly("12345678901")), null)
  })
})

describe("hashCpfForDonorStorage", () => {
  it("mesmo CPF e salt produzem o mesmo hash (paridade entre ingestões)", () => {
    const salt = "test-salt-fixture"
    const h1 = hashCpfForDonorStorage("12345678909", salt)
    const h2 = hashCpfForDonorStorage("12345678909", salt)
    assert.equal(h1, h2)
    assert.equal(h1.length, 64)
  })

  it("salt diferente altera o hash", () => {
    assert.notEqual(
      hashCpfForDonorStorage("12345678909", "a"),
      hashCpfForDonorStorage("12345678909", "b")
    )
  })
})

describe("extractOptionalDonorIdsFromTseRow", () => {
  it("sem coluna de documento retorna vazio", () => {
    assert.deepEqual(
      extractOptionalDonorIdsFromTseRow(
        { NM_DOADOR: "Fulano", VR_RECEITA: "1" },
        "salt",
        { requireSaltWhenCpfPresent: false }
      ),
      {}
    )
  })

  it("CNPJ na linha retorna cnpj", () => {
    assert.deepEqual(
      extractOptionalDonorIdsFromTseRow(
        { NR_CPF_CNPJ_DOADOR: "12.345.678/0001-90" },
        undefined,
        { requireSaltWhenCpfPresent: true }
      ),
      { cnpj: "12345678000190" }
    )
  })

  it("CPF com salt retorna cpf_hash", () => {
    const row = { NR_CPF_CNPJ_DOADOR: "123.456.789-09" }
    const out = extractOptionalDonorIdsFromTseRow(row, "s", { requireSaltWhenCpfPresent: false })
    assert.ok(out.cpf_hash)
    assert.equal(out.cpf_hash, hashCpfForDonorStorage("12345678909", "s"))
  })

  it("CPF sem salt e requireSaltWhenCpfPresent lança", () => {
    assert.throws(
      () =>
        extractOptionalDonorIdsFromTseRow(
          { NR_CPF_CNPJ_DOADOR: "12345678909" },
          undefined,
          { requireSaltWhenCpfPresent: true }
        ),
      /PF_DOADOR_CPF_HASH_SALT/
    )
  })

  it("CPF sem salt e não strict omite cpf_hash", () => {
    assert.deepEqual(
      extractOptionalDonorIdsFromTseRow(
        { NR_CPF_CNPJ_DOADOR: "12345678909" },
        undefined,
        { requireSaltWhenCpfPresent: false }
      ),
      {}
    )
  })
})

describe("B0 — cabeçalho real TSE 2022 (receitas candidatos)", () => {
  it("fixture RR alinha com BRASIL: NR_CPF_CNPJ_DOADOR e ordem das chaves no código", () => {
    const raw = readFileSync(
      join(repoRoot, "tests/fixtures/tse-receitas-candidatos-2022-RR-header-line.csv"),
      "utf8"
    )
    const cols = parseTseReceitasHeaderLine(raw)
    assert.ok(cols.includes("NR_CPF_CNPJ_DOADOR"), "CSV 2022 deve expor documento do doador (não só do candidato)")
    const keys = TSE_CSV_DONOR_DOCUMENT_COLUMN_KEYS as readonly string[]
    const presentInOrder = keys.filter((k) => cols.includes(k))
    assert.ok(presentInOrder.length > 0, "lista TSE_CSV_DONOR_DOCUMENT_COLUMN_KEYS deve intersectar o cabeçalho real")
    assert.equal(
      presentInOrder[0],
      "NR_CPF_CNPJ_DOADOR",
      "coluna oficial TSE deve ser a primeira chave reconhecida na ordem do ingest"
    )
  })

  it("linha mínima com colunas do layout real extrai documento", () => {
    const row: Record<string, string> = {
      SQ_CANDIDATO: "0",
      NM_DOADOR: "Doador fixture",
      VR_RECEITA: "1,00",
      DS_ORIGEM_RECEITA: "DOACAO DE PESSOA JURIDICA",
      NR_CPF_CNPJ_DOADOR: "12.345.678/0001-90",
    }
    assert.equal(pickRawDonorDocumentFromTseRow(row), "12.345.678/0001-90")
    assert.deepEqual(extractOptionalDonorIdsFromTseRow(row, undefined, { requireSaltWhenCpfPresent: true }), {
      cnpj: "12345678000190",
    })
  })
})
