/**
 * Gera a migration de resultado (DML) de um turno a partir do plano de
 * `scripts/lib/resultados-tse.ts`, no molde auditado do repositório:
 * migration com guard de coorte vazia e de pf.replay, CAS da preimagem medida,
 * recibo em coleta_log com before/after por linha, readback, rollback com CAS
 * da postimagem e readback do rollback, allowlist e recorte, e o manifesto que
 * apply-fase-eleitoral-production.sh lê.
 *
 * O gerador é puro: recebe o plano e devolve os textos. A CLI
 * (scripts/resultados-tse-fase.ts) grava os arquivos.
 */
import { createHash } from "node:crypto"

import type { MudancaFase, PlanoFase } from "./resultados-tse"

export interface ArquivosFase {
  nome: string
  migration: string
  readback: string
  rollback: string
  rollbackReadback: string
  allowlist: Record<string, unknown>
  recorte: { nome: string; desde: string; ate: string; allowlist: string; divida: null }
  manifesto: ManifestoFase
}

export interface ManifestoFase {
  conjunto: string
  base_version: string
  base_name: string
  migrations: Array<{ version: string; name: string }>
  plano_sha256?: string
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function litNullable(value: string | null): string {
  return value === null ? "NULL" : lit(value)
}

function assertVersion(version: string, rotulo: string): void {
  if (!/^\d{14}$/.test(version)) throw new Error(`${rotulo} inválida: ${version}`)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validarMudanca(m: MudancaFase): void {
  if (!UUID.test(m.id)) throw new Error(`id inválido em ${m.slug}`)
  if (!/^[a-z0-9-]+$/.test(m.slug)) throw new Error(`slug inválido: ${m.slug}`)
  const semAlegacao = m.fase_depois === "fora_da_disputa" && m.cargo === "Senador" && m.turno === 1
    && m.fonte === null && m.situacao_tse === null
  if (m.sq !== null && !/^\d+$/.test(m.sq)) throw new Error(`SQ inválido em ${m.slug}`)
  if (!semAlegacao && m.sq_antes === null) throw new Error(`SQ ausente na preimagem de ${m.slug}`)
  if (!semAlegacao && (!m.sq || !m.fonte || !m.situacao_tse)) throw new Error(`resultado incompleto em ${m.slug}`)
  if (m.fonte !== null && !/^https:\/\/resultados\.tse\.jus\.br\/oficial\//.test(m.fonte)) throw new Error(`fonte fora do TSE em ${m.slug}`)
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
}

export function gerarArquivosFase(input: {
  plano: PlanoFase
  version: string
  predecessor: { version: string; name: string }
}): ArquivosFase {
  const { plano, version } = input
  if (plano.status !== "completo" || plano.pendentes.length > 0) throw new Error("plano incompleto: nenhuma candidatura pode ser marcada")
  assertVersion(version, "versão")
  assertVersion(input.predecessor.version, "predecessor")
  if (version <= input.predecessor.version) throw new Error("versão precisa ser posterior ao predecessor")
  if (plano.mudancas.length === 0) throw new Error("plano sem mudanças: nada a gravar")
  const fontesOk = new Map(plano.fontes.filter((f) => f.ok && f.sha256).map((f) => [f.url, f.sha256 as string]))
  for (const m of plano.mudancas) {
    validarMudanca(m)
    if (m.fonte !== null && !fontesOk.has(m.fonte)) throw new Error(`mudança de ${m.slug} aponta para fonte não lida`)
    if (m.fonte === null && !(m.cargo === "Senador" && m.fase_depois === "fora_da_disputa" && m.situacao_tse === null)) {
      throw new Error(`mudança de ${m.slug} sem resultado individual não é fallback permitido`)
    }
    if (m.turno !== plano.turno) throw new Error(`mudança de ${m.slug} com turno divergente`)
    const esperadoAntes = plano.turno === 1 ? "em_disputa" : "segundo_turno"
    if (m.fase_antes !== esperadoAntes) throw new Error(`mudança de ${m.slug} com fase anterior ${m.fase_antes}`)
  }
  const n = plano.mudancas.length
  const turno = plano.turno
  const nome = `fase_eleitoral_turno_${turno}`
  const ref = `fase-turno-${turno}-${version}`
  const planoSha = sha256Json(plano)
  const tabela = `pf_fase_plano_${version}`
  const primeiraFonte = plano.mudancas.find((m) => m.fonte)?.fonte ?? null
  const valores = plano.mudancas.map((m) => `    (${[
    `${lit(m.id)}::uuid`, lit(m.slug), litNullable(m.sq), litNullable(m.sq_antes), lit(m.cargo), lit(m.fase_antes), lit(m.fase_depois),
    String(m.turno), m.encerra_atualizacao ? "true" : "false", litNullable(m.situacao_tse?.slice(0, 200) ?? null),
    litNullable(m.fonte), litNullable(m.fonte ? fontesOk.get(m.fonte) ?? null : null),
  ].join(", ")})`).join(",\n")
  const contagem = Object.entries(plano.resumo).map(([k, v]) => `${k}=${v}`).join(", ")
  const fontesComentario = plano.fontes.filter((f) => f.ok).map((f) => `--   ${f.url}\n--     sha256 ${f.sha256} (gerado pelo TSE em ${f.gerado_tse ?? "?"})`).join("\n")

  const planoTemp = `  CREATE TEMP TABLE ${tabela} (
    candidato_id uuid PRIMARY KEY, slug text NOT NULL, sq text, sq_antes text, cargo text NOT NULL,
    fase_antes text NOT NULL, fase_depois text NOT NULL, turno smallint NOT NULL, encerra boolean NOT NULL,
    situacao_tse text, fonte_url text, fonte_sha256 text
  ) ON COMMIT DROP;
  INSERT INTO ${tabela} VALUES
${valores};`

  const migration = `-- Resultado oficial do TSE, ${turno}º turno de 2026: fase eleitoral de ${n} candidatura(s).
--
-- Gerada por \`scripts/resultados-tse-fase.ts gerar\` a partir do plano
-- sha256 ${planoSha} (${plano.gerado_em}). Contagem: ${contagem}.
-- Fontes (divulgação oficial, totalização final, todas as seções):
${fontesComentario}
--
-- Escrita: candidaturas_fase_2026 (${turno === 1 ? "inserção; nenhuma linha pode existir antes" : "atualização com CAS da fase segundo_turno"})
-- e recibo em coleta_log com before/after de cada linha. Candidatura com
-- atualizacao_encerrada_em sai da coorte de atualização; a ficha continua no
-- ar e nenhum dado é apagado. Pendências do plano (${plano.pendentes.length}) não são tocadas.
--
-- NÃO aplicar por \`supabase db push\` nem por automação: produção só recebe
-- esta migration pelo workflow apply-fase-eleitoral-production (conjunto turno-${turno}).
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidaturas_fase_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE MODE;

DO $apply$
DECLARE
  quantidade integer;
  encerrada date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE '${ref}: coorte ausente; resultado ignorado (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE '${ref}: resultado ignorado apenas no replay descartável';
    RETURN;
  END IF;

${planoTemp}

  -- Preimagem: cada candidatura existe, está no ar, com o SQ e o cargo do plano.
  IF (SELECT count(*) FROM ${tabela} p
       JOIN public.candidatos c ON c.id = p.candidato_id
      WHERE c.slug = p.slug AND c.sq_candidato_2026 IS NOT DISTINCT FROM p.sq_antes AND c.cargo_disputado = p.cargo
        AND c.publicavel IS TRUE AND c.status <> 'removido') <> ${n} THEN
    RAISE EXCEPTION '${ref}: preimagem de candidatos divergiu';
  END IF;
${turno === 1 ? `  IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 f JOIN ${tabela} p ON p.candidato_id = f.candidato_id) THEN
    RAISE EXCEPTION '${ref}: candidatura já tem fase gravada';
  END IF;` : `  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN ${tabela} p ON p.candidato_id = f.candidato_id
       WHERE f.fase_eleitoral = 'segundo_turno' AND f.fase_turno = 1 AND f.atualizacao_encerrada_em IS NULL) <> ${n} THEN
    RAISE EXCEPTION '${ref}: preimagem de segundo turno divergiu';
  END IF;`}

  -- Preimagem integral de cada linha (nula no 1º turno), para o recibo e o rollback.
  CREATE TEMP TABLE ${tabela}_antes ON COMMIT DROP AS
    SELECT f.candidato_id, to_jsonb(f) AS antes
    FROM public.candidaturas_fase_2026 f JOIN ${tabela} p ON p.candidato_id = f.candidato_id;

  -- @write tabela=candidaturas_fase_2026 ref=${ref} campos=candidato_id,sq_candidato_2026,cargo_disputado,fase_eleitoral,fase_turno,atualizacao_encerrada_em,situacao_tse,fonte_url,fonte_sha256,migration_version,registrado_em
  INSERT INTO public.candidaturas_fase_2026 AS f
    (candidato_id, sq_candidato_2026, cargo_disputado, fase_eleitoral, fase_turno, atualizacao_encerrada_em,
     situacao_tse, fonte_url, fonte_sha256, migration_version, registrado_em)
  SELECT p.candidato_id, p.sq, p.cargo, p.fase_depois, p.turno,
         CASE WHEN p.encerra THEN encerrada END,
         p.situacao_tse, p.fonte_url, p.fonte_sha256, '${version}', now()
  FROM ${tabela} p
${turno === 1 ? "  ON CONFLICT (candidato_id) DO NOTHING;" : `  ON CONFLICT (candidato_id) DO UPDATE
    SET fase_eleitoral = EXCLUDED.fase_eleitoral,
        fase_turno = EXCLUDED.fase_turno,
        atualizacao_encerrada_em = EXCLUDED.atualizacao_encerrada_em,
        situacao_tse = EXCLUDED.situacao_tse,
        fonte_url = EXCLUDED.fonte_url,
        fonte_sha256 = EXCLUDED.fonte_sha256,
        migration_version = EXCLUDED.migration_version,
        registrado_em = EXCLUDED.registrado_em
    WHERE f.fase_eleitoral = 'segundo_turno' AND f.atualizacao_encerrada_em IS NULL;`}
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> ${n} THEN
    RAISE EXCEPTION '${ref}: escrita esperada=${n} atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:${version} campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', ${n},
         jsonb_build_object(
           'resumo', ${lit(`Resultado oficial do ${turno}º turno de 2026 gravado para ${n} candidatura(s): ${contagem}.`)},
           'plano_sha256', ${lit(planoSha)},
           'turno', ${turno},
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', p.slug,
             'candidato_id', p.candidato_id,
             'before', (SELECT a.antes FROM ${tabela}_antes a WHERE a.candidato_id = p.candidato_id),
             'after', to_jsonb(f)) ORDER BY p.slug)
         )::text,
         ${litNullable(primeiraFonte)},
         'migration:${version}', 'escrita'
  FROM ${tabela} p
  JOIN public.candidaturas_fase_2026 f ON f.candidato_id = p.candidato_id;

  IF (SELECT count(*) FROM public.candidaturas_fase_2026 f JOIN ${tabela} p ON p.candidato_id = f.candidato_id
       WHERE f.migration_version = '${version}' AND f.fase_eleitoral = p.fase_depois AND f.fase_turno = p.turno
         AND (f.atualizacao_encerrada_em IS NOT NULL) = p.encerra) <> ${n} THEN
    RAISE EXCEPTION '${ref}: pós-condição falhou';
  END IF;
END
$apply$;

COMMIT;
`
  return montarArquivos({ input, nome, ref, n, version, planoSha, migration, tabela })
}

function montarArquivos(ctx: {
  input: { plano: PlanoFase; version: string; predecessor: { version: string; name: string } }
  nome: string
  ref: string
  n: number
  version: string
  planoSha: string
  migration: string
  tabela: string
}): ArquivosFase {
  const { input, nome, ref, n, version, planoSha } = ctx
  const turno = input.plano.turno
  const slugs = input.plano.mudancas.map((m) => m.slug)
  const beforeTurno2 = turno === 2

  const readback = `BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:${version}') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:${version}' AND volume = ${n} AND resultado = 'encontrado') THEN
    RAISE EXCEPTION '${ref} readback: recibo ausente ou inválido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:${version}';
  IF jsonb_array_length(r->'linhas') <> ${n} OR r->>'plano_sha256' IS DISTINCT FROM '${planoSha}' THEN
    RAISE EXCEPTION '${ref} readback: recibo não corresponde ao plano';
  END IF;
  -- Linha regravada por uma migration de resultado POSTERIOR (2º turno) é
  -- conferida pelo readback dela; aqui só as que ainda são desta versão.
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 f
                WHERE f.candidato_id = (linha->>'candidato_id')::uuid AND f.migration_version = '${version}')
       AND (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
           IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION '${ref} readback: postimagem divergiu em %', linha->>'slug';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 f
                    WHERE f.candidato_id = (linha->>'candidato_id')::uuid
                      AND (f.migration_version = '${version}' OR f.migration_version > '${version}')) THEN
      RAISE EXCEPTION '${ref} readback: fase ausente em %', linha->>'slug';
    END IF;
  END LOOP;
END
$readback$;
COMMIT;
`

  const rollback = `-- Preservador: devolve candidaturas_fase_2026 à preimagem integral do recibo
-- \`migration:${version}\`, com CAS da postimagem. ${beforeTurno2 ? "Linhas voltam a segundo_turno." : "Linhas inseridas saem (em_disputa = sem linha)."}
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidaturas_fase_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '${version}' THEN
    RAISE EXCEPTION '${ref} rollback: ledger divergiu (rollback só vale com esta migration no topo)';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:${version}') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:${version}') THEN
    RAISE EXCEPTION '${ref} rollback: recibo inválido ou rollback repetido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:${version}';
  IF jsonb_array_length(r->'linhas') <> ${n} THEN
    RAISE EXCEPTION '${ref} rollback: recibo sem as ${n} linhas';
  END IF;
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION '${ref} rollback: % não está na postimagem', linha->>'slug';
    END IF;
    IF linha->'before' IS NULL OR jsonb_typeof(linha->'before') = 'null' THEN
      DELETE FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid;
    ELSE
      UPDATE public.candidaturas_fase_2026 f
      SET fase_eleitoral = linha->'before'->>'fase_eleitoral',
          fase_turno = (linha->'before'->>'fase_turno')::smallint,
          atualizacao_encerrada_em = (linha->'before'->>'atualizacao_encerrada_em')::date,
          situacao_tse = linha->'before'->>'situacao_tse',
          fonte_url = linha->'before'->>'fonte_url',
          fonte_sha256 = linha->'before'->>'fonte_sha256',
          migration_version = linha->'before'->>'migration_version',
          registrado_em = (linha->'before'->>'registrado_em')::timestamptz
      WHERE f.candidato_id = (linha->>'candidato_id')::uuid;
    END IF;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION '${ref} rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;
  END LOOP;

  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', ${n},
         jsonb_build_object('resumo', 'Rollback da migration ${version}: fase eleitoral de ${n} candidatura(s) volta ao estado anterior.',
                            'plano_sha256', '${planoSha}')::text,
         l.url, 'rollback:${version}', 'escrita'
  FROM public.coleta_log l WHERE l.execucao = 'migration:${version}';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '${version}';
END
$rollback$;
COMMIT;
`

  const rollbackReadback = `BEGIN READ ONLY;
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${version}') THEN
    RAISE EXCEPTION '${ref} rollback readback: versão continua no ledger';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:${version}') <> 1 THEN
    RAISE EXCEPTION '${ref} rollback readback: recibo do rollback ausente';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:${version}';
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF linha->'before' IS NULL OR jsonb_typeof(linha->'before') = 'null' THEN
      IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 WHERE candidato_id = (linha->>'candidato_id')::uuid) THEN
        RAISE EXCEPTION '${ref} rollback readback: % continua com fase gravada', linha->>'slug';
      END IF;
    ELSIF (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
          IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION '${ref} rollback readback: % não voltou à preimagem', linha->>'slug';
    END IF;
  END LOOP;
END
$readback$;
COMMIT;
`
  const dia = version.slice(0, 8)
  const allowlistPath = `scripts/audit/allowlist-fase-eleitoral-turno-${turno}-${dia}.json`
  const allowlist = {
    versao: `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`,
    _comentario: `Allowlist fechada da migration ${version} (resultado oficial do ${turno}º turno de 2026), gerada por scripts/resultados-tse-fase.ts a partir do plano sha256 ${planoSha}.`,
    fonte: "Divulgação oficial de resultados do TSE (resultados.tse.jus.br/oficial), arquivos com totalização final; URLs e SHA-256 no cabeçalho da migration e no recibo.",
    motivo: "Registrar a fase eleitoral de cada candidatura e encerrar a atualização de quem saiu da disputa, sem despublicar ficha nem apagar dado.",
    coorte: slugs,
    fora_por_construcao: { slugs: [] },
    entries: [],
    referencias: [
      {
        tabela: "candidaturas_fase_2026",
        ref,
        campos: ["candidato_id", "sq_candidato_2026", "cargo_disputado", "fase_eleitoral", "fase_turno", "atualizacao_encerrada_em", "situacao_tse", "fonte_url", "fonte_sha256", "migration_version", "registrado_em"],
      },
      {
        tabela: "coleta_log",
        ref: `migration:${version}`,
        campos: ["fonte", "escopo", "alvo", "resultado", "volume", "detalhe", "url", "execucao", "natureza"],
      },
    ],
  }
  return {
    nome: `${version}_${nome}`,
    migration: ctx.migration,
    readback,
    rollback,
    rollbackReadback,
    allowlist,
    recorte: { nome: `fase-eleitoral-turno-${turno}-${dia}`, desde: version, ate: version, allowlist: allowlistPath, divida: null },
    manifesto: {
      conjunto: `turno-${turno}`,
      base_version: input.predecessor.version,
      base_name: input.predecessor.name,
      migrations: [{ version, name: nome }],
      plano_sha256: planoSha,
    },
  }
}
