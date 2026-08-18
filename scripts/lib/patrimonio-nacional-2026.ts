export type OrigemAncora = "frozen_sq" | "pr203_sq" | "seed_sq"
export type RotaIdentidade = OrigemAncora | "cpf_consulta"

export interface CandidatoPublicavel {
  slug: string
  cpf: string | null
  cargo_disputado: string
  estado: string | null
}

export interface LinhaConsultaCand {
  sq: string
  cpf: string
  cargo: string
  uf: string
  geracao: string
}

export interface AncoraSq {
  sq: string
  origem: OrigemAncora
}

export interface IdentidadeResolvida {
  slug: string
  sq: string
  cargo: string
  uf: string | null
  rota: RotaIdentidade
  geracaoConsulta: string
}

export type MotivoExclusaoIdentidade =
  | "ambiguous_anchor"
  | "cpf_mismatch"
  | "cpf_not_found_or_scope_mismatch"
  | "no_sq_or_cpf"
  | "sq_not_found_or_scope_mismatch"

export interface IdentidadeExcluida {
  slug: string
  cargo: string
  uf: string | null
  rota: RotaIdentidade | ""
  motivo: MotivoExclusaoIdentidade
}

export interface ResultadoIdentidades {
  resolvidos: IdentidadeResolvida[]
  excluidos: IdentidadeExcluida[]
}

export interface BemPatrimonioTse {
  sq: string
  sourceKey: string
  ordem: string
  tipo: string
  descricao: string
  valorCentavos: number
  geracao: string
}

export interface CandidatoComPatrimonio extends IdentidadeResolvida {
  bens: BemPatrimonioTse[]
  totalCentavos: number
}

export interface CoberturaPatrimonio {
  positivos: CandidatoComPatrimonio[]
  semDeclaracao: IdentidadeResolvida[]
  paraCarregar: CandidatoComPatrimonio[]
  jaCarregados: CandidatoComPatrimonio[]
}

export interface MetadataMigrationPatrimonio {
  snapshot: string
  geracaoCsv: string
  fonteUrl: string
  zipSha256: string
}

export function normalizarIdentificadorNumerico(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "")
  return digits.replace(/^0+/, "")
}

function normalizarTexto(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
}

function linhaNoEscopo(
  candidato: CandidatoPublicavel,
  linha: LinhaConsultaCand,
): boolean {
  const cargo = normalizarTexto(candidato.cargo_disputado)
  if (normalizarTexto(linha.cargo) !== cargo) return false
  return cargo === "PRESIDENTE" || normalizarTexto(linha.uf) === normalizarTexto(candidato.estado)
}

function normalizarLinhaConsulta(linha: LinhaConsultaCand): LinhaConsultaCand {
  return {
    ...linha,
    sq: normalizarIdentificadorNumerico(linha.sq),
    cpf: normalizarIdentificadorNumerico(linha.cpf),
    cargo: normalizarTexto(linha.cargo),
    uf: normalizarTexto(linha.uf),
  }
}

function unicasPorIdentidade(linhas: LinhaConsultaCand[]): LinhaConsultaCand[] {
  return [
    ...new Map(
      linhas.map((linha) => [
        `${linha.sq}|${linha.cpf}|${linha.cargo}|${linha.uf}`,
        linha,
      ]),
    ).values(),
  ]
}

export function resolverIdentidades(
  candidatos: readonly CandidatoPublicavel[],
  consultaCand: readonly LinhaConsultaCand[],
  ancoras: ReadonlyMap<string, AncoraSq>,
): ResultadoIdentidades {
  const linhas = consultaCand.map(normalizarLinhaConsulta)
  const porSq = new Map<string, LinhaConsultaCand[]>()
  const porCpf = new Map<string, LinhaConsultaCand[]>()

  for (const linha of linhas) {
    if (linha.sq) porSq.set(linha.sq, [...(porSq.get(linha.sq) ?? []), linha])
    if (linha.cpf) porCpf.set(linha.cpf, [...(porCpf.get(linha.cpf) ?? []), linha])
  }

  const resolvidos: IdentidadeResolvida[] = []
  const excluidos: IdentidadeExcluida[] = []

  for (const candidato of candidatos) {
    const cpf = normalizarIdentificadorNumerico(candidato.cpf)
    const ancora = ancoras.get(candidato.slug)
    let rota: RotaIdentidade | "" = ancora?.origem ?? ""
    let candidatas: LinhaConsultaCand[] = []
    let motivo: MotivoExclusaoIdentidade | null = null

    if (ancora) {
      const sq = normalizarIdentificadorNumerico(ancora.sq)
      candidatas = unicasPorIdentidade(
        (porSq.get(sq) ?? []).filter((linha) => linhaNoEscopo(candidato, linha)),
      )
      if (candidatas.length === 0) motivo = "sq_not_found_or_scope_mismatch"
    } else if (!cpf) {
      motivo = "no_sq_or_cpf"
    } else {
      rota = "cpf_consulta"
      candidatas = unicasPorIdentidade(
        (porCpf.get(cpf) ?? []).filter((linha) => linhaNoEscopo(candidato, linha)),
      )
      if (candidatas.length === 0) motivo = "cpf_not_found_or_scope_mismatch"
    }

    if (!motivo && candidatas.length > 1) motivo = "ambiguous_anchor"
    if (!motivo && cpf && candidatas[0]?.cpf !== cpf) motivo = "cpf_mismatch"

    if (motivo || !candidatas[0] || !rota) {
      excluidos.push({
        slug: candidato.slug,
        cargo: candidato.cargo_disputado,
        uf: candidato.estado,
        rota,
        motivo: motivo ?? "ambiguous_anchor",
      })
      continue
    }

    resolvidos.push({
      slug: candidato.slug,
      sq: candidatas[0].sq,
      cargo: candidato.cargo_disputado,
      uf: candidato.estado,
      rota,
      geracaoConsulta: candidatas[0].geracao,
    })
  }

  return { resolvidos, excluidos }
}

function chaveBem(slug: string, bem: BemPatrimonioTse): string {
  const ordem = bem.ordem.trim()
  if (ordem) return `${slug}|ordem:${ordem}`
  return [slug, bem.tipo.trim(), bem.descricao.trim(), bem.valorCentavos].join("|")
}

function deduplicarBens(
  slug: string,
  bens: readonly BemPatrimonioTse[],
): BemPatrimonioTse[] {
  const primeiraFonte = new Map<string, string>()
  const output: BemPatrimonioTse[] = []
  for (const bem of bens) {
    const chave = chaveBem(slug, bem)
    const fonte = primeiraFonte.get(chave)
    if (fonte && fonte !== bem.sourceKey) continue
    if (!fonte) primeiraFonte.set(chave, bem.sourceKey)
    output.push(bem)
  }
  return output.sort((a, b) => {
    const ordem = Number(a.ordem) - Number(b.ordem)
    if (Number.isFinite(ordem) && ordem !== 0) return ordem
    return `${a.tipo}|${a.descricao}|${a.valorCentavos}`.localeCompare(
      `${b.tipo}|${b.descricao}|${b.valorCentavos}`,
      "pt-BR",
    )
  })
}

export function separarCoberturaPatrimonio(
  identidades: readonly IdentidadeResolvida[],
  todosOsBens: readonly BemPatrimonioTse[],
  slugsJaCarregados: ReadonlySet<string>,
): CoberturaPatrimonio {
  const bensPorSq = new Map<string, BemPatrimonioTse[]>()
  for (const bem of todosOsBens) {
    const sq = normalizarIdentificadorNumerico(bem.sq)
    bensPorSq.set(sq, [...(bensPorSq.get(sq) ?? []), { ...bem, sq }])
  }

  const positivos: CandidatoComPatrimonio[] = []
  const semDeclaracao: IdentidadeResolvida[] = []
  for (const identidade of identidades) {
    const bens = deduplicarBens(
      identidade.slug,
      bensPorSq.get(normalizarIdentificadorNumerico(identidade.sq)) ?? [],
    )
    if (bens.length === 0) {
      semDeclaracao.push(identidade)
      continue
    }
    positivos.push({
      ...identidade,
      bens,
      totalCentavos: bens.reduce((total, bem) => total + bem.valorCentavos, 0),
    })
  }

  return {
    positivos,
    semDeclaracao,
    paraCarregar: positivos.filter((item) => !slugsJaCarregados.has(item.slug)),
    jaCarregados: positivos.filter((item) => slugsJaCarregados.has(item.slug)),
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function centavosParaSql(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100)
  return `${inteiro}.${String(Math.abs(centavos % 100)).padStart(2, "0")}`
}

function fonteDaLinha(
  candidato: CandidatoComPatrimonio,
  metadata: MetadataMigrationPatrimonio,
): string {
  return `TSE Dados Abertos bem_candidato_2026 SQ ${candidato.sq} (total agregado, snapshot ${metadata.snapshot}; CSV gerado ${metadata.geracaoCsv} BRT; ${metadata.fonteUrl})`
}

function condicaoEstado(alias: string, uf: string | null): string {
  return uf ? `${alias}.estado = ${sqlLiteral(uf)}` : `${alias}.estado IS NULL`
}

export function gerarMigrationSql(
  candidatos: readonly CandidatoComPatrimonio[],
  metadata: MetadataMigrationPatrimonio,
): string {
  if (candidatos.length === 0) throw new Error("migration nacional sem carga positiva")

  const slugs = candidatos.map((candidato) => sqlLiteral(candidato.slug)).join(", ")
  const linhas = candidatos.map((candidato) => {
    const bens = candidato.bens.map((bem) => ({
      tipo: bem.tipo,
      descricao: bem.descricao,
      valor: bem.valorCentavos / 100,
    }))
    const bensJson = JSON.stringify(bens).replace(/'/g, "''")
    const fonte = fonteDaLinha(candidato, metadata)
    return `-- @write tabela=patrimonio slug=${candidato.slug} ano=2026 snapshot=${metadata.snapshot.replaceAll(" ", "_")} campos=candidato_id,ano_eleicao,valor_total,bens,fonte
INSERT INTO public.patrimonio AS p (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, 2026, ${centavosParaSql(candidato.totalCentavos)}, '${bensJson}'::jsonb, ${sqlLiteral(fonte)}
FROM public.candidatos c
WHERE c.slug = ${sqlLiteral(candidato.slug)}
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND c.cargo_disputado = ${sqlLiteral(candidato.cargo)}
  AND ${condicaoEstado("c", candidato.uf)}
  AND (
    SELECT COUNT(*)
    FROM public.candidatos coorte
    WHERE coorte.slug IN (${slugs})
      AND coorte.publicavel = true
      AND coorte.status <> 'removido'
  ) = ${candidatos.length}
ON CONFLICT (candidato_id, ano_eleicao) DO UPDATE
SET valor_total = EXCLUDED.valor_total,
    bens = EXCLUDED.bens,
    fonte = EXCLUDED.fonte
WHERE (p.valor_total, p.bens, p.fonte)
      IS DISTINCT FROM (EXCLUDED.valor_total, EXCLUDED.bens, EXCLUDED.fonte);`
  })

  const esperados = candidatos
    .map(
      (candidato) =>
        `    (${sqlLiteral(candidato.slug)}, ${centavosParaSql(candidato.totalCentavos)}::numeric, ${candidato.bens.length}, ${sqlLiteral(fonteDaLinha(candidato, metadata))})`,
    )
    .join(",\n")

  return `-- P-PATRIMONIO-NACIONAL: carga positiva de bens 2026 das fichas públicas.
-- Fonte oficial: ${metadata.fonteUrl}
-- ZIP sha256: ${metadata.zipSha256}
-- Snapshot congelado: ${metadata.snapshot}; CSV gerado ${metadata.geracaoCsv} BRT.
-- Ausências neste snapshot ficam somente no relatório e não geram estado oficial.
BEGIN;

DO $$
DECLARE
  n_coorte integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos c
  WHERE c.slug IN (${slugs})
    AND c.publicavel = true
    AND c.status <> 'removido';

  IF n_coorte NOT IN (0, ${candidatos.length})
     AND to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'P-PATRIMONIO-NACIONAL: coorte parcial em banco com ledger, esperados ${candidatos.length} candidatos, encontrados %', n_coorte;
  END IF;
END $$;

${linhas.join("\n\n")}

DO $$
DECLARE
  n_coorte integer;
  n_corretos integer;
BEGIN
  SELECT COUNT(*) INTO n_coorte
  FROM public.candidatos c
  WHERE c.slug IN (${slugs})
    AND c.publicavel = true
    AND c.status <> 'removido';

  IF n_coorte = 0 THEN
    RETURN;
  END IF;
  IF n_coorte <> ${candidatos.length} THEN
    RETURN;
  END IF;

  WITH esperados(slug, valor_total, n_bens, fonte) AS (
    VALUES
${esperados}
  )
  SELECT COUNT(*) INTO n_corretos
  FROM esperados e
  JOIN public.candidatos c ON c.slug = e.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = 2026
   AND p.valor_total = e.valor_total
   AND jsonb_array_length(p.bens) = e.n_bens
   AND p.fonte = e.fonte;

  IF n_corretos <> ${candidatos.length} THEN
    RAISE EXCEPTION 'P-PATRIMONIO-NACIONAL: esperadas ${candidatos.length} linhas exatas, encontradas %', n_corretos;
  END IF;
END $$;

COMMIT;
`
}
