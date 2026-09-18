import assert from "node:assert/strict"
import { deflateRawSync } from "node:zlib"
import { describe, it } from "node:test"
import {
  classificarEsquemaFiliacao,
  COLUNAS_FILIACAO_AGREGADA,
  inspecionarEsquemaPublicado,
} from "../scripts/lib/ingest-filiacao"
import { parseIngestCliOptions } from "../scripts/lib/pipeline-cli-options"

/** ZIP mínimo com um único arquivo deflated, suficiente para o pré-voo. */
function zipComCabecalho(linha: string): Buffer {
  const conteudo = deflateRawSync(Buffer.from(`${linha}\n`, "latin1"))
  const nome = Buffer.from("perfil_filiacao_partidaria.csv", "latin1")
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(8, 8)
  header.writeUInt16LE(nome.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, nome, conteudo])
}

function fetcherComZip(buffer: Buffer): typeof fetch {
  return (async () =>
    new Response(new Uint8Array(buffer), { status: 206 })) as unknown as typeof fetch
}

describe("fonte oficial de filiação partidária", () => {
  it("o recurso publicado pelo TSE é o perfil agregado, sem eleitor", () => {
    // Cabeçalho real lido em 18/09/2026 de
    // https://cdn.tse.jus.br/estatistica/sead/odsele/filiacao_partidaria/perfil_filiacao_partidaria.zip
    assert.equal(classificarEsquemaFiliacao([...COLUNAS_FILIACAO_AGREGADA]), "agregada")
    assert.equal(
      classificarEsquemaFiliacao(["NM_ELEITOR", "SG_PARTIDO", "DS_SITUACAO_FILIADO", "DT_FILIACAO", "DT_DESFILIACAO"]),
      "individual",
    )
  })

  it("o pré-voo lê o cabeçalho por range e classifica sem baixar o arquivo inteiro", async () => {
    const agregado = await inspecionarEsquemaPublicado(
      "https://exemplo.invalido/perfil.zip",
      fetcherComZip(zipComCabecalho(COLUNAS_FILIACAO_AGREGADA.map((c) => `"${c}"`).join(";"))),
    )
    assert.equal(agregado?.schema, "agregada")
    assert.ok(agregado?.headers.includes("QT_FILIADO"))

    const individual = await inspecionarEsquemaPublicado(
      "https://exemplo.invalido/perfil.zip",
      fetcherComZip(zipComCabecalho('"NM_ELEITOR";"SG_PARTIDO";"DS_SITUACAO_FILIADO";"DT_FILIACAO";"DT_DESFILIACAO"')),
    )
    assert.equal(individual?.schema, "individual")
  })

  it("o pré-voo devolve null em vez de quebrar quando a resposta não é um ZIP", async () => {
    const naoZip = (async () => new Response("<html>bloqueado</html>", { status: 200 })) as unknown as typeof fetch
    assert.equal(await inspecionarEsquemaPublicado("https://exemplo.invalido/x.zip", naoZip), null)

    const erro = (async () => new Response("", { status: 403 })) as unknown as typeof fetch
    assert.equal(await inspecionarEsquemaPublicado("https://exemplo.invalido/x.zip", erro), null)
  })
})

describe("--dry-run", () => {
  it("é desligado por padrão e não exige escopo por slug", () => {
    assert.equal(parseIngestCliOptions(["filiacao"], {}).dryRun, false)
    assert.equal(parseIngestCliOptions(["filiacao", "--dry-run"], {}).dryRun, true)
  })
})
