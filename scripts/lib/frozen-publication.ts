export const FROZEN_PUBLICATION_ITEMS = [
  {
    slug: "arnaldinho-borgo",
    reason:
      "Cobertura recente indica retirada da disputa principal em 2026; manter oculto até confirmação forte.",
  },
  {
    slug: "da-vitoria",
    reason:
      "Corrida de 2026 no ES oscila entre Senado e outras composições; manter oculto até confirmação forte.",
  },
  {
    slug: "paulo-hartung",
    reason:
      "Sem âncora oficial mínima recente; manter oculto até confirmação forte.",
  },
  {
    slug: "sergio-vidigal",
    reason:
      "Cobertura recente enfraquece a tese de candidatura própria ao governo; manter oculto até confirmação forte.",
  },
  {
    slug: "simao-jatene",
    reason:
      "Sem âncora oficial mínima recente; manter oculto até confirmação forte.",
  },
  {
    slug: "gilson-machado",
    reason:
      "A corrida tratada na cobertura recente parece ser outra, não governo estadual; manter oculto até confirmação forte.",
  },
  {
    slug: "silvio-mendes",
    reason:
      "Cobertura recente aponta que não disputará o governo do PI em 2026; manter oculto até confirmação forte.",
  },
  {
    slug: "garotinho",
    reason:
      "Movimentação recente não fecha corrida ao governo do RJ com segurança; manter oculto até confirmação forte.",
  },
  {
    slug: "rodrigo-bacellar",
    reason:
      "Cobertura recente mistura crise institucional e ambição eleitoral; manter oculto até confirmação forte.",
  },
  {
    slug: "tarcisio-motta",
    reason:
      "Há prova do mandato atual, mas não de candidatura consolidada ao governo do RJ; manter oculto até confirmação forte.",
  },
  {
    slug: "washington-reis",
    reason:
      "Cobertura do RJ está ambígua sobre a corrida real de 2026; manter oculto até confirmação forte.",
  },
  {
    slug: "arthur-henrique",
    reason:
      "Fontes abertas aparecem conflitantes sobre partido e projeção eleitoral; manter oculto até confirmação forte.",
  },
  {
    slug: "evandro-augusto",
    reason:
      "Perfil segue sem âncora oficial suficiente; manter oculto até confirmação forte.",
  },
  {
    slug: "andre-do-prado",
    reason:
      "Há sinais de composição, mas não prova sólida de cabeça de chapa; manter oculto até confirmação forte.",
  },
  {
    slug: "marcio-franca",
    reason:
      "Cargo atual é claro, mas a corrida de 2026 segue ambígua; manter oculto até confirmação forte.",
  },
] as const

export const FROZEN_PUBLICATION_SLUGS: ReadonlySet<string> = new Set<string>(
  FROZEN_PUBLICATION_ITEMS.map((item) => item.slug)
)

export const FROZEN_PUBLICATION_REASON_MAP: ReadonlyMap<string, string> = new Map<string, string>(
  FROZEN_PUBLICATION_ITEMS.map((item) => [item.slug, item.reason])
)
