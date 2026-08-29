#!/usr/bin/env node
// Oraculo do gate G2 dos programas de governo 2026: verifica, derivando os
// valores exclusivamente do inventario oficial versionado, que os registros
// gerados cobrem exatamente o universo esperado. Falha fechado: qualquer UF
// ausente, quantidade divergente por UF, identidade duplicada ou estranha,
// estado editorial invalido, documento/pagina fora do inventario bloqueia.
//
// Uso:
//   node scripts/data/programas-governo-governadores-2026-wave-consolidado.mjs \
//     --ondas-dir=<dir> \
//     --inventory=<scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json> \
//     [--regiao=norte] [--estrito]
//
// --regiao restringe o escopo a uma onda (contagem de UFs da regiao).
// --estrito exige zero bloqueios pendentes na regiao verificada.
import { readFile, readdir } from "node:fs/promises"

const ESTADOS_VALIDOS = new Set([
  "em_revisao",
  "perfil_local_ausente",
  "sem_documento_oficial",
  "falha_de_extracao",
])
const REGIOES = {
  norte: ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
  nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "centro-oeste": ["DF", "GO", "MS", "MT"],
  sudeste: ["ES", "MG", "RJ", "SP"],
  sul: ["PR", "RS", "SC"],
}

function argumento(nome) {
  const prefixo = `--${nome}=`
  const achado = process.argv.find((item) => item.startsWith(prefixo))
  return achado ? achado.slice(prefixo.length) : undefined
}

function falha(lista, mensagem) {
  lista.push(mensagem)
}

async function lerRegistrosUf(ondasDir, regiao, uf, falhas) {
  const diretorio = `${ondasDir}/${regiao}/${uf}`
  let arquivos
  try {
    arquivos = (await readdir(diretorio)).filter((f) => f.endsWith(".json")).sort()
  } catch {
    falha(falhas, `${regiao}/${uf}: diretorio de resultados ausente`)
    return []
  }
  const registros = []
  for (const arquivo of arquivos) {
    try {
      registros.push(JSON.parse(await readFile(`${diretorio}/${arquivo}`, "utf8")))
    } catch (erro) {
      falha(falhas, `${regiao}/${uf}/${arquivo}: JSON ilegivel (${String(erro.message).slice(0, 120)})`)
    }
  }
  return registros
}

function identidadeDeCandidato(candidato) {
  return `${candidato.uf}:${candidato.sqCandidato}`
}

async function main() {
  const falhas = []
  const relatarFalhas = () => {
    if (falhas.length === 0) return false
    console.error(`ONDA_CONSOLIDADO_FAIL falhas=${falhas.length}`)
    console.error(falhas.map((mensagem) => `FALHA ${mensagem}`).join("\n"))
    process.exitCode = 1
    return true
  }
  const ondasDir = argumento("ondas-dir")
  const inventoryPath = argumento("inventory")
  const regiaoFiltro = argumento("regiao")
  const estrito = process.argv.includes("--estrito")
  if (!ondasDir || !inventoryPath) {
    console.error("use --ondas-dir=<dir> --inventory=<json> [--regiao=<nome>] [--estrito]")
    process.exitCode = 1
    return
  }
  if (!REGIOES[regiaoFiltro ?? "norte"] && regiaoFiltro !== undefined) {
    falha(falhas, `--regiao invalida: ${regiaoFiltro}`)
    relatarFalhas()
    return
  }
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8"))
  if (inventory?.escopo?.ano !== 2026 || inventory?.escopo?.cargo !== "GOVERNADOR") {
    falha(falhas, "inventario fora do escopo 2026:GOVERNADOR")
    relatarFalhas()
    return
  }
  const ufsAlvo = regiaoFiltro ? REGIOES[regiaoFiltro] : Object.values(REGIOES).flat()

  const documentosPorId = new Map(inventory.documentos.map((doc) => [doc.id, doc]))
  const candidatosPorIdentidade = new Map()
  const ufsNoInventario = new Set()
  for (const candidato of inventory.candidaturas) {
    if (!ufsAlvo.includes(candidato.uf)) continue
    ufsNoInventario.add(candidato.uf)
    const chaveEsperada = `2026:${candidato.cargo}:${candidato.uf}:${candidato.sqCandidato}`
    if (candidato.chave !== chaveEsperada) {
      falha(falhas, `inventario ${identidadeDeCandidato(candidato)}: chave composta divergente (${candidato.chave})`)
      continue
    }
    if (candidatosPorIdentidade.has(identidadeDeCandidato(candidato))) {
      falha(falhas, `inventario: identidade duplicada ${identidadeDeCandidato(candidato)}`)
      continue
    }
    candidatosPorIdentidade.set(identidadeDeCandidato(candidato), candidato)
  }

  let totalRegistros = 0
  let totalDocumentos = 0
  let totalPaginas = 0
  let totalAprovados = 0
  let totalBloqueiosPendentes = 0
  const resumoPorUf = {}

  for (const [regiaoNome, ufsDaRegiao] of Object.entries(REGIOES)) {
    const ufsSelecionadas = ufsAlvo.filter((uf) => ufsDaRegiao.includes(uf))
    if (regiaoFiltro ? regiaoNome !== regiaoFiltro : ufsSelecionadas.length === 0) continue
    for (const uf of ufsSelecionadas.sort()) {
      const candidatosDaUf = inventory.candidaturas.filter((candidate) => candidate.uf === uf)
      const registros = await lerRegistrosUf(ondasDir, regiaoNome, uf, falhas)
    // UFs do inventario da regiao precisam aparecer explicitamente com a
    // contagem exata por UF; nunca compensar uma UF ausente com registros
    // extras em outra.
    if (registros.length !== candidatosDaUf.length) {
      falha(falhas, `${uf}: candidaturas=${registros.length}; esperado=${candidatosDaUf.length}`)
      continue
    }
    let aprovadosUf = 0
    let bloqueiosUf = 0
    const vistasNaUf = new Set()
    let docsUf = 0
    let paginasUf = 0

    for (const registro of registros) {
      totalRegistros += 1
      const fonte = registro.fonte ?? {}
      const identidade = `${fonte.uf}:${fonte.sqCandidato}`
      const candidato = candidatosPorIdentidade.get(identidade)

      if (registro.version !== 1) falha(falhas, `${uf} ${identidade}: version=${JSON.stringify(registro.version)} != 1`)
      if (registro.estado === "aprovado") {
        aprovadosUf += 1
        falha(falhas, `${uf} ${identidade}: registro APROVADO nao deveria existir nesta etapa`)
      } else if (!ESTADOS_VALIDOS.has(registro.estado)) {
        falha(falhas, `${uf} ${identidade}: estado editorial invalido "${String(registro.estado)}"`)
        continue
      }
      if (fonte.cargo !== "GOVERNADOR" || fonte.ano !== 2026 || fonte.uf !== uf) {
        falha(falhas, `${uf} ${identidade}: cabecalho de fonte divergente (ano/cargo/UF)`)
      }
      if (registro.ingestao?.identityKey !== `2026:GOVERNADOR:${uf}:${fonte.sqCandidato}`) {
        falha(falhas, `${uf} ${identidade}: identityKey divergente`)
      }
      if (!candidato) {
        falha(falhas, `${uf} ${identidade}: registro sem correspondencia no inventario`)
        continue
      }
      if (vistasNaUf.has(identidade)) {
        falha(falhas, `${uf} ${identidade}: identidade duplicada entre registros`)
      }
      vistasNaUf.add(identidade)

      // Identidade completa contra o inventario.
      if (fonte.nomeUrna !== candidato.nomeUrna || fonte.partido !== candidato.partido) {
        falha(falhas, `${uf} ${identidade}: nomeUrna/partido divergentes do inventario`)
      }

      // Estado editorial coerente com o vinculo local.
      const vinculado = candidato.perfilEstado === "vinculado"
      if (registro.estado === "perfil_local_ausente" && vinculado) {
        falha(falhas, `${uf} ${identidade}: perfil_local_ausente mas inventario declara perfil vinculado`)
      }

      // Ausencias explicitas: sem documento so existe quando o inventario
      // tambem nao tem documento; package-only precisa arquivoNome nulo.
      if (registro.estado === "sem_documento_oficial") {
        if ((candidato.documentoIds ?? []).length > 0 || registro.documentos?.length) {
          falha(falhas, `${uf} ${identidade}: sem_documento_oficial com documentos no inventario/registro`)
        }
        if (fonte.arquivoNome != null || fonte.arquivoNoPacote != null) {
          falha(falhas, `${uf} ${identidade}: ausencia nao materializada como package-only`)
        }
      }

      // Documentos: conjunto exato e paginas por documento.
      const documentosInventario = (candidato.documentoIds ?? []).map((id) => documentosPorId.get(id)).filter(Boolean)
      const documentosRegistro = registro.documentos ?? []
      if (documentosRegistro.map(({ documentoId }) => documentoId).join(",") !== documentosInventario.map(({ id }) => id).join(",")) {
        falha(falhas, `${uf} ${identidade}: conjunto documental divergente do inventario`)
        continue
      }
      for (const documento of documentosRegistro) {
        docsUf += 1
        const esperado = documentosPorId.get(documento.documentoId)
        if (!esperado) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: documento estranho ao inventario`)
          continue
        }
        const extracao = documento.extracao ?? {}
        if (/^[a-f0-9]{64}$/u.test(String(extracao.sourceSha256 ?? "")) !== true
          || String(extracao.sourceSha256).toLowerCase() !== String(esperado.sha256).toLowerCase()) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: SHA-256 da fonte diverge do inventario`)
        }
        if (/^[a-f0-9]{64}$/u.test(extracao.extractedTextSha256 ?? "") !== true) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: extractedTextSha256 ausente/invalido`)
        }
        if (extracao.paginas !== esperado.paginas) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: paginas=${String(extracao.paginas)}; inventario=${esperado.paginas}`)
        }
        if (!Array.isArray(extracao.pageMap) || extracao.pageMap.length !== esperado.paginas) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: pageMap incompleto para ${esperado.paginas} paginas`)
        }
        if (!Array.isArray(extracao.secoes) || extracao.secoes.length !== esperado.paginas) {
          falha(falhas, `${uf} ${identidade}/${documento.documentoId}: secoes/paginas divergentes (${Array.isArray(extracao.secoes) ? extracao.secoes.length : "ausente"} vs ${esperado.paginas})`)
        }
        paginasUf += Number(extracao.paginas ?? 0)
      }

      // Bloqueios pendentes explícitos.
      const bloqueado = registro.estado === "falha_de_extracao"
        || registro.ingestao?.eval?.completo === false
        || (registro.ingestao?.etapa === "modelos" && registro.ingestao?.erro)
      if (bloqueado) bloqueiosUf += 1
      if (bloqueado && registro.ingestao?.erro == null) {
        falha(falhas, `${uf} ${identidade}: bloqueio sem erro explícito materializado`)
      }
    }

    // Toda a candidatura da UF apareceu e foi conferida.
    for (const candidato of candidatosDaUf) {
      if (!vistasNaUf.has(identidadeDeCandidato(candidato))) {
        falha(falhas, `${uf} ${identidadeDeCandidato(candidato)}: candidatura do inventario ausente dos registros`)
      }
    }

    if (estrito && bloqueiosUf > 0) {
      falha(falhas, `${uf}: ${bloqueiosUf} bloqueio(s) pendente(s) em modo estrito`)
    }
    if (aprovadosUf > 0) totalAprovados += aprovadosUf
    totalBloqueiosPendentes += bloqueiosUf
    totalDocumentos += docsUf
    totalPaginas += paginasUf
    resumoPorUf[`${regiaoNome}/${uf}`] = {
      candidaturas: registros.length,
      em_revisao: registros.filter((r) => r.estado === "em_revisao").length,
      perfil_local_ausente: registros.filter((r) => r.estado === "perfil_local_ausente").length,
      sem_documento_oficial: registros.filter((r) => r.estado === "sem_documento_oficial").length,
      falha_de_extracao: registros.filter((r) => r.estado === "falha_de_extracao").length,
      documentos: docsUf,
      paginas: paginasUf,
      elegiveis: registros.filter((r) => r.estado === "em_revisao" && r.ingestao?.eval?.completo === true).length,
      bloqueiosPendentes: bloqueiosUf,
    }
    }
  }

  const escopoUfs = regiaoFiltro ? REGIOES[regiaoFiltro] : Object.values(REGIOES).flat().sort()
  for (const uf of escopoUfs) {
    if (!ufsNoInventario.has(uf)) falha(falhas, `inventario: UF ${uf} sem candidaturas declaradas`)
  }

  if (relatarFalhas()) return
  console.log(JSON.stringify({
    resultado: "ONDAS_CONSOLIDADO_PASS",
    regiao: regiaoFiltro ?? "todas",
    ufs: [...ufsAlvo].sort(),
    candidaturas: totalRegistros,
    documentos: totalDocumentos,
    paginas: totalPaginas,
    aprovados: totalAprovados,
    bloqueiosPendentes: totalBloqueiosPendentes,
    resumoPorUf,
  }, null, 2))
}

await main()
