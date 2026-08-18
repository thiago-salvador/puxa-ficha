/**
 * Gerador da migration de perfil da B2.
 *
 * Portado de `.mjs` para `.ts` em 09/08/2026 por dois motivos, nesta ordem:
 *
 * 1. **Ligar o escritor ao contrato.** Ate aqui ele lia
 *    `source_verification_dates.proposed_value` e emitia o mapa VERBATIM como
 *    `verificacao_campos`. Nao havia enforcement nenhum: o que estivesse no
 *    ledger virava coluna, inclusive `null` em campos que a propria pesquisa
 *    provou serem `vazio_confirmado`. Agora o jsonb sai de
 *    `construirPatchVerificacaoCampos`, e os estados vem de uma traducao
 *    explicita `(campo, query_result)` em `scripts/lib/verificacao-campos-ledger-b2.ts`.
 * 2. **Entrar nos gates.** Como `.mjs` o arquivo ficava fora de
 *    `tsconfig.scripts.json` (`scripts/**\/*.ts`) e do `knip`: o escritor de uma
 *    coluna publica nao era typechecado por ninguem.
 *
 * ## Duas mudancas de saida, ambas deliberadas
 *
 * - `social_networks` dos 2 casos `no_row_for_safe_sq` passa a ter data;
 * - chaves nao resolvidas deixam de sair como `"chave": null` e passam a ser
 *   OMITIDAS. Isso nao e cosmetico: o merge e
 *   `COALESCE(verificacao_campos,'{}') || d.verificacao_campos`, e em jsonb o
 *   `||` com null do lado direito SOBRESCREVE, entao uma segunda passada
 *   apagaria uma data boa anterior.
 *
 * Por causa disso, `supabase/migrations/20260807052000_b2_current_profiles_tse_2026.sql`
 * **nao deve ser regenerado**: ele esta RETIDO e congelado byte a byte por
 * `tests/migrations-retidas-gate.test.ts`, e carrega a saida pre-contrato.
 * Regenera-lo e parte da decisao futura da etapa 9, com decisao registrada.
 */

import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"


import {
  conferirIdentidadeDasLinhas,
  construirLinhasB2,
  contarLinhasB2,
  type PerfilB2,
} from "./lib/b2-perfil-builder"

const sourcePath = resolve(process.argv[2] ?? "")
const outputPath = resolve(process.argv[3] ?? "")
if (!process.argv[2] || !process.argv[3]) {
  throw new Error(
    "uso: npx tsx scripts/generate-b2-current-profile-migration.ts <proposals.jsonl> <migration.sql>",
  )
}

const source = readFileSync(sourcePath, "utf8")
const profiles: PerfilB2[] = source
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line) as PerfilB2)

const data = construirLinhasB2(profiles)

const counts = contarLinhasB2(data)
const expected = {
  profiles: 194,
  registrations: 45,
  official_social_records: 43,
  social_profiles: 40,
  sites: 24,
  professions: 45,
  education: 45,
  verification: 194,
}
/**
 * SHA-256 do ledger da B2 medido na execucao `pf-completeness-20260807T022551Z`.
 * `expected` acima e a cardinalidade CONGELADA DESSE ledger, e de mais nenhum.
 */
const LEDGER_B2_SHA256 = "78dec9789bdd4952cbf781f5bd4952a75f919b4a82903e6869a42468cc168fc0"

/**
 * A cardinalidade e amarrada a IDENTIDADE do ledger, nao ao caminho do arquivo.
 *
 * Duas versoes anteriores erraram aqui, e as duas foram bypass de verdade:
 * `PF_B2_SEM_CARDINALIDADE=1` desligava por variavel de ambiente, e depois
 * qualquer arquivo sob `tests/fixtures/` desligava por caminho. Nos dois casos
 * bastava mover ou renomear a entrada para o guard sumir, e junto com ele o
 * guard de SQ divergente contra o seed.
 *
 * Agora: se o ledger E o congelado, as contagens TEM de bater, sem escape. Se e
 * outro ledger, contagem de 194 perfis nao se aplica a ele, e o programa diz
 * isso em voz alta em vez de fingir que conferiu. Os gates que valem para
 * QUALQUER ledger, identidade da etapa 2 e SQ contra o seed, rodam sempre.
 */
const ledgerSha = createHash("sha256").update(source).digest("hex")
if (ledgerSha !== LEDGER_B2_SHA256) {
  throw new Error(
    `ledger nao reconhecido: medido ${ledgerSha}, congelado ${LEDGER_B2_SHA256}.\n\n` +
      `Este executavel so opera sobre o ledger da execucao pf-completeness-20260807T022551Z, ` +
      `porque as contagens congeladas (194 perfis, 45 registros, 43 redes, 24 sites) descrevem ` +
      `AQUELE ledger e mais nenhum. Aceitar outro conteudo com um aviso, como a versao anterior ` +
      `fazia, deixava o bypass de pe: bastava editar o arquivo para a cardinalidade parar de ser ` +
      `conferida.\n\n` +
      `Ledger novo exige decisao explicita: remedir as contagens, atualizar CARDINALIDADE_CONGELADA ` +
      `e LEDGER_B2_SHA256 no mesmo commit, e registrar em Settings/STATUS.md.`,
  )
}
if (JSON.stringify(counts) !== JSON.stringify(expected)) {
  throw new Error(`fila inesperada para o ledger congelado: ${JSON.stringify(counts)}`)
}

const candidatesPath = fileURLToPath(new URL("../data/candidatos.json", import.meta.url))
const candidates = JSON.parse(readFileSync(candidatesPath, "utf8")) as {
  slug: string
  ids?: { tse_sq_candidato?: Record<string, string> | null } | null
}[]

// Porta da etapa 2 + identidade canonica contra o seed. Exatamente a mesma
// funcao que o teste chama, sem escape nenhum no executavel.
conferirIdentidadeDasLinhas(data, candidates)

const quote = (value: unknown) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`
const cargo = (role: string | null | undefined) =>
  ({
    PRESIDENTE: "Presidente",
    GOVERNADOR: "Governador",
    "VICE-GOVERNADOR": "Vice-Governador",
  })[role ?? ""] ?? null

const values = data
  .map(
    (row) =>
      `  (${[
        quote(row.slug),
        quote(row.registration?.sq_candidato),
        quote(cargo(row.registration?.role)),
        quote(row.registration?.uf),
        quote(row.registration?.party),
        quote(row.registration?.judgment),
        quote(row.registration?.accepted_at),
        row.officialSocialRecord ? "true" : "false",
        json(row.networks),
        quote(row.site),
        quote(row.profession),
        quote(row.education),
        json(row.verification),
      ].join(", ")})`,
  )
  .join(",\n")

const sourceHash = createHash("sha256").update(source).digest("hex")
const sql = `-- Atualizacao de perfil baseada no TSE 2026 e no readback publico da fila fechada.
-- Execucao: pf-completeness-20260807T022551Z
-- SHA-256 do ledger B2: ${sourceHash}
-- Registros encontrados aguardam julgamento; nao sao apresentados como deferidos.
-- verificacao_campos sai de construirPatchVerificacaoCampos: chave presente
-- significa campo verificado (publicado ou vazio_confirmado). Chave AUSENTE
-- preserva a data anterior no merge com \`||\`; null a apagaria.
--
-- ESTE ARQUIVO NAO CARREGA SCHEMA. A coluna, o privilegio de coluna e a view
-- publica vivem em 20260809060000_verificacao_campos_schema_publico.sql, que e
-- schema puro. Emitir DDL aqui produziria migration MISTA, proibida pela issue
-- #136 e reprovada por tests/migrations-classificacao.test.ts. Pre-condicao para
-- aplicar este arquivo: a 20260809060000 ja aplicada.
--
-- SEM \`BEGIN;\`/\`COMMIT;\` PROPRIOS, pela mesma regra da 20260809060000
-- (Settings/WORKFLOWS.md): quem aplica envolve o arquivo mais a linha do ledger
-- numa transacao externa unica, e um COMMIT no meio encerraria essa transacao
-- antes da gravacao do ledger.
--
-- A transacao externa nao e opcional aqui: \`_pf_current_profile\` e
-- \`ON COMMIT DROP\`. Medido em Postgres 17: sob \`psql --single-transaction\` a
-- temp table sobrevive entre statements; em autocommit ela morre no primeiro
-- COMMIT implicito e o INSERT seguinte falha na hora. A falha e barulhenta, nao
-- silenciosa.

CREATE TEMP TABLE _pf_current_profile (
  slug text PRIMARY KEY,
  sq_candidato text,
  cargo_disputado text,
  uf text,
  partido text,
  julgamento text,
  recebido_em timestamp,
  registro_social_oficial boolean NOT NULL,
  redes jsonb NOT NULL,
  site text,
  profissao text,
  formacao text,
  verificacao_campos jsonb NOT NULL
) ON COMMIT DROP;

-- @write tabela=_pf_current_profile ref=B2-perfis-20260807 campos=perfil,redes,site,profissao,formacao,verificacao
INSERT INTO _pf_current_profile
SELECT *
FROM (VALUES
${values}
) AS source(
  slug, sq_candidato, cargo_disputado, uf, partido, julgamento, recebido_em,
  registro_social_oficial, redes, site, profissao, formacao, verificacao_campos
)
WHERE 'B2-perfis-20260807' = 'B2-perfis-20260807';

CREATE OR REPLACE FUNCTION pg_temp.pf_social_has_value(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE jsonb_typeof(value)
    WHEN 'string' THEN btrim(value #>> '{}') <> ''
    WHEN 'number' THEN true
    WHEN 'boolean' THEN true
    WHEN 'array' THEN jsonb_array_length(value) > 0
    WHEN 'object' THEN EXISTS (
      SELECT 1 FROM jsonb_each(value) item
      WHERE pg_temp.pf_social_has_value(item.value)
    )
    ELSE false
  END
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.pf_merge_social(existing jsonb, proposed jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(jsonb_object_agg(keys.key,
    CASE
      WHEN pg_temp.pf_social_has_value(COALESCE(existing, '{}'::jsonb) -> keys.key)
        OR NOT COALESCE(proposed, '{}'::jsonb) ? keys.key
      THEN COALESCE(existing, '{}'::jsonb) -> keys.key
      ELSE proposed -> keys.key
    END
  ), '{}'::jsonb)
  FROM jsonb_object_keys(COALESCE(existing, '{}'::jsonb) || COALESCE(proposed, '{}'::jsonb)) keys(key)
$fn$;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM _pf_current_profile) <> 194 THEN
    RAISE EXCEPTION 'B2 perfil: cardinalidade diferente de 194';
  END IF;
  IF (SELECT count(*) FROM _pf_current_profile WHERE sq_candidato IS NOT NULL) <> 45 THEN
    RAISE EXCEPTION 'B2 perfil: registros TSE diferentes de 45';
  END IF;
  IF (SELECT count(*) FROM _pf_current_profile WHERE registro_social_oficial) <> 43 THEN
    RAISE EXCEPTION 'B2 perfil: registros sociais TSE diferentes de 43';
  END IF;
  IF (SELECT count(*) FROM _pf_current_profile WHERE site IS NOT NULL) <> 24 THEN
    RAISE EXCEPTION 'B2 perfil: sites materializaveis diferentes de 24';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _pf_current_profile d
    LEFT JOIN public.candidatos c ON c.slug = d.slug
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'B2 perfil: slug sem candidato correspondente';
  END IF;
END
$guard$;

-- @write tabela=candidatos ref=B2-perfis-20260807 campos=status,situacao_candidatura,cargo_disputado,estado,partido_sigla,partido_atual,redes_sociais,site_campanha,profissao_declarada,formacao,fonte_dados,ultima_atualizacao,verificacao_campos
UPDATE public.candidatos c
SET
  status = CASE WHEN d.sq_candidato IS NOT NULL THEN 'candidato' ELSE c.status END,
  situacao_candidatura = CASE
    WHEN d.sq_candidato IS NOT NULL THEN 'aguardando julgamento'
    ELSE c.situacao_candidatura
  END,
  cargo_disputado = COALESCE(d.cargo_disputado, c.cargo_disputado),
  estado = COALESCE(d.uf, c.estado),
  partido_sigla = COALESCE(d.partido, c.partido_sigla),
  partido_atual = COALESCE(d.partido, c.partido_atual),
  redes_sociais = pg_temp.pf_merge_social(c.redes_sociais, d.redes),
  site_campanha = CASE
    WHEN COALESCE(btrim(c.site_campanha), '') = '' THEN d.site
    ELSE c.site_campanha
  END,
  profissao_declarada = CASE
    WHEN COALESCE(btrim(c.profissao_declarada), '') = '' OR c.profissao_declarada ~ '^Q[0-9]+$'
      THEN COALESCE(d.profissao, c.profissao_declarada)
    ELSE c.profissao_declarada
  END,
  formacao = CASE
    WHEN COALESCE(btrim(c.formacao), '') = '' THEN COALESCE(d.formacao, c.formacao)
    ELSE c.formacao
  END,
  fonte_dados = ARRAY(
    SELECT DISTINCT source
    FROM unnest(
      COALESCE(c.fonte_dados, ARRAY[]::text[]) ||
      CASE
        WHEN d.sq_candidato IS NOT NULL
          THEN ARRAY['TSE consulta_cand 2026 SQ ' || d.sq_candidato]
        ELSE ARRAY[]::text[]
      END ||
      CASE
        WHEN d.registro_social_oficial THEN ARRAY['TSE redes sociais 2026']
        ELSE ARRAY[]::text[]
      END
    ) AS source
  ),
  ultima_atualizacao = now(),
  verificacao_campos = COALESCE(c.verificacao_campos, '{}'::jsonb) || d.verificacao_campos
FROM _pf_current_profile d
WHERE c.slug = d.slug
  AND 'B2-perfis-20260807' = 'B2-perfis-20260807';

-- @write tabela=historico_politico ref=B2-perfis-20260807 campos=tipo_evento,cargo,cargo_canonico,estado,periodo_inicio,periodo_fim,partido,eleito_por,observacoes,proveniencia
INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT
  c.id, 'candidatura', d.cargo_disputado, d.cargo_disputado, d.uf,
  2026, 2026, d.partido, 'pedido de registro no TSE',
  'Pedido de registro de candidatura no TSE; aguardando julgamento em 06/08/2026.',
  'TSE'
FROM _pf_current_profile d
JOIN public.candidatos c ON c.slug = d.slug
WHERE d.sq_candidato IS NOT NULL
  AND 'B2-perfis-20260807' = 'B2-perfis-20260807'
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;
`

writeFileSync(outputPath, sql)
console.log(JSON.stringify({ source_sha256: sourceHash, counts, output: outputPath }))
