/**
 * Converte a auditoria sanitizada dos 66 CNJs em proposta local completa.
 *
 * Nenhum arquivo e colocado em supabase/migrations: o pacote continua sujeito
 * a aprovacao editorial nominal antes de entrar no ledger aplicavel.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { cnjValido, tipoProcessual, type LinhaProcesso } from "./gerar-migration-processos-curadoria"
import { PROCESS_STATUS_NEUTRAL } from "../src/lib/processos-display"

const MARCADOR = "curadoria-djen-20260810"
const TIMESTAMP = "20260810123000"

interface ProcessoAuditado {
  slug: string
  numero_cnj: string
  payload_tecnico_pronto: boolean
  publicacao_pronta: boolean
  classes: string[]
  tribunais: string[]
  polos_candidato: string[]
  orgaos: string[]
  tipos_comunicacao: string[]
  primeira_comunicacao: string
  ultima_comunicacao: string
  status_publico: string
  status_processual_merito: null
  data_inicio: null
  data_decisao: null
  descricao_publica: string
  fonte_oficial: string
  campos_faltantes: string[]
  campos_nao_inferidos: string[]
}

interface Auditoria66 {
  origem_bruta_sha256: string
  totais: {
    processos: number
    fichas: number
    consultas_com_erro: number
    payloads_tecnicos_prontos: number
  }
  processos: ProcessoAuditado[]
}

interface Linha66 extends LinhaProcesso {
  status: typeof PROCESS_STATUS_NEUTRAL
  data_inicio: null
  data_decisao: null
  gravidade: null
}

function sqlTexto(valor: string): string {
  return `'${valor.replaceAll("'", "''").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()}'`
}

function linhasDaAuditoria(auditoria: Auditoria66): Linha66[] {
  if (auditoria.totais.processos !== 66 || auditoria.processos.length !== 66) {
    throw new Error(`auditoria precisa conter 66 processos; recebeu ${auditoria.processos.length}`)
  }
  if (auditoria.totais.fichas !== 25) throw new Error("auditoria precisa conter 25 fichas")
  if (auditoria.totais.consultas_com_erro !== 0) throw new Error("auditoria contem erro de consulta")
  if (auditoria.totais.payloads_tecnicos_prontos !== 66) {
    throw new Error("nem todos os 66 payloads tecnicos estao prontos")
  }

  const vistos = new Set<string>()
  return auditoria.processos.map((processo) => {
    if (vistos.has(processo.numero_cnj)) throw new Error(`CNJ duplicado: ${processo.numero_cnj}`)
    vistos.add(processo.numero_cnj)
    if (!cnjValido(processo.numero_cnj)) throw new Error(`CNJ invalido: ${processo.numero_cnj}`)
    if (!processo.payload_tecnico_pronto || processo.campos_faltantes.length > 0) {
      throw new Error(`${processo.numero_cnj}: payload incompleto`)
    }
    if (processo.publicacao_pronta) {
      throw new Error(`${processo.numero_cnj}: artefato nao pode autoaprovar publicacao editorial`)
    }
    if (
      processo.status_publico !== PROCESS_STATUS_NEUTRAL ||
      processo.status_processual_merito !== null ||
      processo.data_inicio !== null ||
      processo.data_decisao !== null
    ) {
      throw new Error(`${processo.numero_cnj}: contrato de nao inferencia divergente`)
    }
    if (
      processo.classes.length === 0 ||
      processo.tribunais.length === 0 ||
      processo.polos_candidato.length === 0 ||
      processo.orgaos.length === 0 ||
      processo.tipos_comunicacao.length === 0 ||
      !processo.primeira_comunicacao ||
      !processo.ultima_comunicacao ||
      !processo.descricao_publica?.trim()
    ) {
      throw new Error(`${processo.numero_cnj}: evidencia oficial incompleta`)
    }
    const url = new URL(processo.fonte_oficial)
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "comunicaapi.pje.jus.br" && url.hostname !== "comunica.pje.jus.br")
    ) {
      throw new Error(`${processo.numero_cnj}: fonte oficial invalida`)
    }
    const cnjDigitos = processo.numero_cnj.replace(/\D/g, "")
    return {
      slug: processo.slug,
      numero_cnj: processo.numero_cnj,
      tipo: tipoProcessual(processo.classes.join(" "), ""),
      tribunal: processo.tribunais.join(" / "),
      descricao: processo.descricao_publica,
      status: PROCESS_STATUS_NEUTRAL,
      data_inicio: null,
      data_decisao: null,
      gravidade: null,
      fonte: `${MARCADOR}: API publica do DJEN/CNJ`,
      url_fonte: `https://comunica.pje.jus.br/consulta?numeroProcesso=${cnjDigitos}`,
    }
  })
}

function valoresSql(linhas: Linha66[]): string {
  return linhas
    .map((linha) =>
      `    (${[
        linha.slug,
        linha.tipo,
        linha.tribunal,
        linha.numero_cnj,
        linha.descricao,
        linha.status,
        linha.fonte,
        linha.url_fonte,
      ].map(sqlTexto).join(", ")})`,
    )
    .join(",\n")
}

function migrationSql(linhas: Linha66[]): string {
  const inserts = linhas.map((linha) => `-- @write tabela=processos slug=${linha.slug} campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
       NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria_66 l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = ${sqlTexto(linha.slug)} AND l.numero_cnj = ${sqlTexto(linha.numero_cnj)};`).join("\n\n")
  return `-- ${TIMESTAMP}_processos_curadoria_djen_66.sql
-- APROVADO EDITORIALMENTE EM 2026-08-11, NAO APLICADO.
CREATE TEMP TABLE _pf_processos_curadoria_66 (
  slug text NOT NULL,
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_cnj text PRIMARY KEY,
  descricao text NOT NULL,
  status text NOT NULL,
  fonte text NOT NULL,
  url_fonte text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_processos_curadoria_66
  (slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${valoresSql(linhas)};

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _pf_processos_curadoria_66;
  IF n <> 66 THEN RAISE EXCEPTION 'processos 66/25: esperados 66, encontrados %', n; END IF;
  SELECT count(DISTINCT slug) INTO n FROM _pf_processos_curadoria_66;
  IF n <> 25 THEN RAISE EXCEPTION 'processos 66/25: esperadas 25 fichas, encontradas %', n; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria_66 l LEFT JOIN public.candidatos c ON c.slug = l.slug WHERE c.id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'processos 66/25: % slugs sem candidato', n; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria_66 l JOIN public.processos p ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g');
  IF n <> 0 THEN RAISE EXCEPTION 'processos 66/25: % CNJs ja existem', n; END IF;
END $$;

${inserts}

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.processos WHERE fonte LIKE '${MARCADOR}: %';
  IF n <> 66 THEN RAISE EXCEPTION 'processos 66/25: esperados 66 inseridos, encontrados %', n; END IF;
END $$;
`
}

function rollbackSql(linhas: Linha66[]): string {
  return `-- ROLLBACK CIRURGICO de ${TIMESTAMP}_processos_curadoria_djen_66.sql
CREATE TEMP TABLE _pf_processos_curadoria_66_rollback (
  slug text NOT NULL,
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_cnj text PRIMARY KEY,
  descricao text NOT NULL,
  status text NOT NULL,
  fonte text NOT NULL,
  url_fonte text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria_66_rollback
  (slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${valoresSql(linhas)};

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.processos p
  JOIN _pf_processos_curadoria_66_rollback l
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  WHERE p.fonte LIKE '${MARCADOR}: %';
  IF n <> 66 THEN RAISE EXCEPTION 'rollback 66/25: esperados 66, encontrados %', n; END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria_66_rollback l
  JOIN public.processos p
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE (c.slug, p.tipo, p.tribunal, p.descricao, p.status, p.fonte, p.url_fonte,
         p.data_inicio, p.data_decisao, p.gravidade)
        IS DISTINCT FROM
        (l.slug, l.tipo, l.tribunal, l.descricao, l.status, l.fonte, l.url_fonte,
         NULL::date, NULL::date, NULL::text);
  IF n <> 0 THEN RAISE EXCEPTION 'rollback 66/25: % registro(s) divergem do lote aplicado; preservar curadoria posterior', n; END IF;
END $$;

DELETE FROM public.processos p
USING _pf_processos_curadoria_66_rollback l
WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  AND p.fonte LIKE '${MARCADOR}: %';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.processos p
  JOIN _pf_processos_curadoria_66_rollback l
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  WHERE p.fonte LIKE '${MARCADOR}: %';
  IF n <> 0 THEN RAISE EXCEPTION 'rollback 66/25: restaram % registros', n; END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '${TIMESTAMP}';
`
}

function readbackSql(linhas: Linha66[]): string {
  return `-- READBACK SOMENTE LEITURA de ${TIMESTAMP}_processos_curadoria_djen_66.sql
CREATE TEMP TABLE pf_readback_judicial_66 AS
WITH expected(slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte) AS (VALUES
${valoresSql(linhas)}
), actual AS (
  SELECT c.slug, p.tipo, p.tribunal, p.numero_processo AS numero_cnj,
         p.descricao, p.status, p.data_inicio, p.data_decisao, p.gravidade,
         p.fonte, p.url_fonte
  FROM public.processos p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.fonte LIKE '${MARCADOR}: %'
)
SELECT
  (SELECT count(*) FROM expected) AS expected_rows,
  (SELECT count(DISTINCT slug) FROM expected) AS expected_candidates,
  (SELECT count(*) FROM actual) AS actual_rows,
  (SELECT count(DISTINCT slug) FROM actual) AS actual_candidates,
  (SELECT count(*) FROM expected e LEFT JOIN actual a ON a.slug = e.slug AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g') WHERE a.numero_cnj IS NULL) AS missing_expected,
  (SELECT count(*) FROM actual a LEFT JOIN expected e ON a.slug = e.slug AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g') WHERE e.numero_cnj IS NULL) AS unexpected_marker,
  (SELECT count(*) FROM expected e
   WHERE (SELECT count(*) FROM public.processos p
          WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1
      OR (SELECT count(*) FROM public.processos p JOIN public.candidatos c ON c.id = p.candidato_id
          WHERE c.slug = e.slug
            AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1) AS global_cnj_mismatch,
  (SELECT count(*) FROM expected e JOIN actual a ON a.slug = e.slug AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE (a.numero_cnj, a.tipo, a.tribunal, a.descricao, a.status, a.fonte, a.url_fonte)
         IS DISTINCT FROM (e.numero_cnj, e.tipo, e.tribunal, e.descricao, e.status, e.fonte, e.url_fonte)) AS payload_mismatch,
  (SELECT count(*) FROM actual WHERE status <> '${PROCESS_STATUS_NEUTRAL}') AS invalid_status,
  (SELECT count(*) FROM actual WHERE data_inicio IS NOT NULL OR data_decisao IS NOT NULL OR gravidade IS NOT NULL) AS inferred_fields,
  (SELECT count(*) FROM actual WHERE descricao IS NULL OR btrim(descricao) = '') AS missing_description,
  (SELECT count(*) FROM actual WHERE url_fonte IS NULL OR url_fonte !~ '^https://comunica[.]pje[.]jus[.]br/consulta') AS invalid_source_urls,
  (SELECT count(*) FROM actual
   WHERE regexp_replace(coalesce(substring(url_fonte from 'numeroProcesso=([^&]+)'), ''), '[^0-9]', '', 'g')
         <> regexp_replace(numero_cnj, '[^0-9]', '', 'g')) AS source_cnj_mismatch;

DO $readback$
DECLARE r pf_readback_judicial_66%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM pf_readback_judicial_66;
  IF r.expected_rows <> 66 OR r.expected_candidates <> 25
     OR r.actual_rows <> 66 OR r.actual_candidates <> 25
     OR r.missing_expected <> 0 OR r.unexpected_marker <> 0 OR r.global_cnj_mismatch <> 0
     OR r.payload_mismatch <> 0 OR r.invalid_status <> 0
     OR r.inferred_fields <> 0 OR r.missing_description <> 0
     OR r.invalid_source_urls <> 0 OR r.source_cnj_mismatch <> 0 THEN
    RAISE EXCEPTION 'readback 20260810123000: %', row_to_json(r);
  END IF;
END
$readback$;

TABLE pf_readback_judicial_66;
`
}

export function prepararPropostaJudicial66(auditoria: Auditoria66) {
  const linhas = linhasDaAuditoria(auditoria)
  const campos = ["candidato_id", "tipo", "tribunal", "numero_processo", "descricao", "status", "data_inicio", "data_decisao", "gravidade", "fonte", "url_fonte"]
  const coorte = [...new Set(linhas.map((linha) => linha.slug))].sort()
  return {
    linhas,
    migration: migrationSql(linhas),
    rollback: rollbackSql(linhas),
    readback: readbackSql(linhas),
    manifesto: {
      schema_version: 1,
      timestamp_reservado: TIMESTAMP,
      estado: "aprovado_editorialmente_nao_aplicado",
      aprovado_em: "2026-08-11",
      processos: linhas.length,
      fichas: coorte.length,
      origem_bruta_sha256: auditoria.origem_bruta_sha256,
      linhas,
    },
    allowlist: {
      _comentario: "APROVADO EDITORIALMENTE EM 2026-08-11, NAO APLICADO: lote procedural 66/25 independente do 69/21.",
      recorte: "processos-curadoria-djen-66-20260810",
      migration: `${TIMESTAMP}_processos_curadoria_djen_66.sql`,
      coorte,
      fora_por_construcao: { slugs: [] as string[] },
      entries: coorte.map((slug) => ({
        tabela: "processos",
        slug,
        campos,
        max_registros: linhas.filter((linha) => linha.slug === slug).length,
      })),
    },
  }
}

function main() {
  const args = process.argv.slice(2)
  const valor = (nome: string) => args.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const auditPath = resolve(valor("audit") ?? "QA/evidencias/2026-08-10-item2-judicial/curadoria-66-25/auditoria-payload-66.json")
  const outputDir = resolve(valor("output-dir") ?? "QA/evidencias/2026-08-10-item2-judicial/proposta-66-25")
  const pacote = prepararPropostaJudicial66(JSON.parse(readFileSync(auditPath, "utf8")) as Auditoria66)
  const arquivos: Record<string, string> = {
    [`${TIMESTAMP}_processos_curadoria_djen_66.sql`]: pacote.migration,
    [`${TIMESTAMP}_processos_curadoria_djen_66.rollback.sql`]: pacote.rollback,
    [`${TIMESTAMP}_processos_curadoria_djen_66.readback.sql`]: pacote.readback,
    "manifesto-processos-curadoria-66.json": `${JSON.stringify(pacote.manifesto, null, 2)}\n`,
    "allowlist-processos-curadoria-66.proposta.json": `${JSON.stringify(pacote.allowlist, null, 2)}\n`,
  }
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const destino = resolve(outputDir, nome)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, conteudo)
  }
  console.log(`proposta 66/25 preparada em ${outputDir}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main()
}
