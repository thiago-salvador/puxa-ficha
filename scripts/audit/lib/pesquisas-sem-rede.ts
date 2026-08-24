const PADROES_ACESSO_REDE = [
  { nome: "fetch", padrao: /\bfetch\s*\(/ },
  { nome: "axios", padrao: /\baxios\s*(?:\.\s*[A-Za-z_$][\w$]*)?\s*\(/ },
  { nome: "https", padrao: /\bhttps\s*\.\s*(?:get|request)\s*\(/ },
  { nome: "undici", padrao: /\bundici\s*\.\s*(?:fetch|request)\s*\(/ },
  {
    nome: "import de cliente de rede",
    padrao:
      /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*["'](?:axios|https|node:https|undici)["']/,
  },
] as const

export function detectarAcessosRede(source: string): string[] {
  return PADROES_ACESSO_REDE
    .filter(({ padrao }) => padrao.test(source))
    .map(({ nome }) => nome)
}
