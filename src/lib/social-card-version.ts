// O card fica 24 h no CDN (s-maxage de /api/card/[slug]). A versão na URL vem
// da última atualização da ficha, então só uma escrita nova gera card novo; um
// valor por abertura (como era o `Date.now()` do preview) furava o cache a cada
// clique.
export function socialCardVersionToken(cardVersion?: string | null): string {
  const ms = cardVersion ? Date.parse(cardVersion) : Number.NaN
  return Number.isFinite(ms) ? Math.floor(ms / 1000).toString(36) : "3"
}
