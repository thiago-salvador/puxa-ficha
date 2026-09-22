/**
 * Compromissos do programa de governo, na unidade usada pelo pré-filtro: o tema
 * do resumo (`resumo.temas[].id`), com o trecho de página que o sustenta e as
 * frases do resumo que citam exatamente a mesma evidência.
 */
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  assertProgramaGovernoRegistro,
  programaGovernoChave,
  type ProgramaGovernoEvidencia,
  type ProgramaGovernoRegistro,
} from "../src/lib/programa-governo"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DIRS = ["src/data/programas-governo/presidencia-2026", "src/data/programas-governo/governadores-2026"]

export type CompromissoTema = {
  temaId: string
  titulo: string
  descricao: string
  evidencias: Array<{ documentoId: string | null; pagina: number; trecho: string }>
  frases: Array<{ id: string; texto: string }>
}

export type ProgramaCompromissos = {
  slug: string
  programaChave: string
  cargo: "PRESIDENTE" | "GOVERNADOR"
  uf: string
  temas: CompromissoTema[]
}

function chaveEvidencia(evidencia: ProgramaGovernoEvidencia): string {
  return `${evidencia.documentoId ?? ""}|${evidencia.pagina}|${evidencia.trecho}`
}

export function compromissosDoRegistro(registro: ProgramaGovernoRegistro): ProgramaCompromissos | null {
  if (registro.estado !== "aprovado" || !registro.resumo || !registro.fonte.slug) return null
  const temaPorEvidencia = new Map<string, string>()
  for (const tema of registro.resumo.temas) {
    for (const evidencia of tema.evidencias) temaPorEvidencia.set(chaveEvidencia(evidencia), tema.id)
  }
  const frasesPorTema = new Map<string, Array<{ id: string; texto: string }>>()
  for (const frase of registro.resumo.frases) {
    const temas = new Set(frase.evidencias.map((e) => temaPorEvidencia.get(chaveEvidencia(e))).filter(Boolean))
    if (temas.size !== 1 || !frase.id) continue
    const temaId = [...temas][0]!
    frasesPorTema.set(temaId, [...(frasesPorTema.get(temaId) ?? []), { id: frase.id, texto: frase.texto }])
  }
  return {
    slug: registro.fonte.slug,
    programaChave: programaGovernoChave(registro.fonte),
    cargo: registro.fonte.cargo,
    uf: registro.fonte.uf,
    temas: registro.resumo.temas.map((tema) => ({
      temaId: tema.id,
      titulo: tema.titulo,
      descricao: tema.descricao,
      evidencias: tema.evidencias.map((e) => ({ documentoId: e.documentoId ?? null, pagina: e.pagina, trecho: e.trecho })),
      frases: frasesPorTema.get(tema.id) ?? [],
    })),
  }
}

export async function carregarProgramasComResumo(root = ROOT): Promise<ProgramaCompromissos[]> {
  const saida: ProgramaCompromissos[] = []
  for (const dir of DIRS) {
    for (const nome of (await readdir(path.join(root, dir))).sort()) {
      if (!nome.endsWith(".json")) continue
      const registro: unknown = JSON.parse(await readFile(path.join(root, dir, nome), "utf8"))
      assertProgramaGovernoRegistro(registro)
      const compromissos = compromissosDoRegistro(registro)
      if (compromissos) saida.push(compromissos)
    }
  }
  return saida
}
