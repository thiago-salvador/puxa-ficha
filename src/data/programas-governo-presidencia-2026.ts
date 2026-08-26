import {
  assertProgramaGovernoRegistro,
  type ProgramaGovernoRegistro,
} from "@/lib/programa-governo"

const loaders = {
  "samara-martins": () => import("./programas-governo/presidencia-2026/samara-martins.json"),
  "romeu-zema": () => import("./programas-governo/presidencia-2026/romeu-zema.json"),
  "renan-santos": () => import("./programas-governo/presidencia-2026/renan-santos.json"),
  "hertz-dias": () => import("./programas-governo/presidencia-2026/hertz-dias.json"),
  "lula": () => import("./programas-governo/presidencia-2026/lula.json"),
  "wilson-grassi-junior": () => import("./programas-governo/presidencia-2026/wilson-grassi-junior.json"),
  "flavio-bolsonaro": () => import("./programas-governo/presidencia-2026/flavio-bolsonaro.json"),
  "augusto-cury": () => import("./programas-governo/presidencia-2026/augusto-cury.json"),
  "ronaldo-caiado": () => import("./programas-governo/presidencia-2026/ronaldo-caiado.json"),
  "edmilson-costa": () => import("./programas-governo/presidencia-2026/edmilson-costa.json"),
  "clariana-barao": () => import("./programas-governo/presidencia-2026/clariana-barao.json"),
  "rui-costa-pimenta": () => import("./programas-governo/presidencia-2026/rui-costa-pimenta.json"),
  "pablo-marcal": () => import("./programas-governo/presidencia-2026/pablo-marcal.json"),
} satisfies Record<string, () => Promise<{ default: unknown }>>

export type ProgramaGovernoPresidencia2026Slug = keyof typeof loaders

export function isProgramaGovernoPresidencia2026Slug(value: string): value is ProgramaGovernoPresidencia2026Slug {
  return Object.hasOwn(loaders, value)
}

export async function loadProgramaGovernoPresidencia2026(slug: ProgramaGovernoPresidencia2026Slug): Promise<ProgramaGovernoRegistro> {
  const record = (await loaders[slug]()).default
  assertProgramaGovernoRegistro(record)
  return record
}
