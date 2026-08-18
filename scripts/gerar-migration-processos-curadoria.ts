/**
 * Gera migration e rollback dos processos aprovados pela curadoria judicial.
 *
 * O gerador e deliberadamente fail-closed: identidade, fonte oficial, CNJ,
 * dedupe e as duas contagens editoriais informadas precisam coincidir antes
 * que qualquer SQL seja escrito. As contagens nunca sao inferidas de outro
 * manifesto: os lotes 69/21 e 66/25 sao complementares e independentes.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const MARCADOR_FONTE = "curadoria-djen-20260805"
const SPLIT_IDENTIDADE_VERSION = "20260811102100"

type IdentidadeHistoricaReadback = {
  candidatoId: string
  nomeCompleto: string
  nomeUrna: string
  slugPosSplit: string
}

const IDENTIDADE_HISTORICA_POR_CNJ = new Map<string, IdentidadeHistoricaReadback>([
  ["08640775520258100001", {
    candidatoId: "47a1de10-1cf7-47f8-837b-dbbf94480421",
    nomeCompleto: "Carlos Orleans Brandão Junior",
    nomeUrna: "Orleans Brandao",
    slugPosSplit: "carlos-brandao-ma-historico",
  }],
  ["08651982120258100001", {
    candidatoId: "47a1de10-1cf7-47f8-837b-dbbf94480421",
    nomeCompleto: "Carlos Orleans Brandão Junior",
    nomeUrna: "Orleans Brandao",
    slugPosSplit: "carlos-brandao-ma-historico",
  }],
])

interface FonteOficial {
  url: string
  titulo: string
  consultado_em?: string
}

interface ItemRevisao {
  slug: string
  numero_cnj: string
  decisao: string
  identidade_confirmada: boolean
  motivo: string
  estado_oficial: string
  familia_processual?: string
  fontes_oficiais: FonteOficial[]
}

interface ProcessoCuradoria {
  numero_cnj: string
  tribunal: string
  classe: string
  url: string
}

interface EntradaPacote {
  itensRevisao: ItemRevisao[]
  processosCuradoria: ProcessoCuradoria[]
  esperadoProcessos: number
  esperadoFichas: number
  timestamp: string
  aprovadoEditorialmente?: boolean
}

export interface LinhaProcesso {
  slug: string
  numero_cnj: string
  tipo: "criminal" | "improbidade" | "eleitoral" | "civil"
  tribunal: string
  descricao: string
  status: string
  fonte: string
  url_fonte: string
}

function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function cnjValido(valor: string): boolean {
  if (!/^\d{20}$/.test(valor) && !/^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(valor)) {
    return false
  }
  const digitos = valor.replace(/\D/g, "")
  if (digitos.length !== 20) return false
  const sequencial = digitos.slice(0, 7)
  const verificador = Number(digitos.slice(7, 9))
  const restante = digitos.slice(9)
  const esperado = 98 - Number(BigInt(`${sequencial}${restante}00`) % BigInt(97))
  return verificador === esperado
}

const COMUNICA_PJE_ORIGEM = "https://comunicaapi.pje.jus.br"
const COMUNICA_PJE_CAMINHO = "/api/v1/comunicacao"

export function urlComunicaPjePorCnj(valor: string, numeroCnj: string): string {
  const cnjDigitos = numeroCnj.replace(/\D/g, "")
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error(`${numeroCnj}: URL individual do Comunica PJe invalida`)
  }
  const numerosProcesso = url.searchParams.getAll("numeroProcesso")
  if (
    url.protocol !== "https:" ||
    url.hostname !== "comunicaapi.pje.jus.br" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.pathname !== COMUNICA_PJE_CAMINHO ||
    numerosProcesso.length !== 1 ||
    !/^\d{20}$/.test(numerosProcesso[0]) ||
    numerosProcesso[0] !== cnjDigitos
  ) {
    throw new Error(`${numeroCnj}: URL individual do Comunica PJe nao prova o proprio CNJ`)
  }
  return `${COMUNICA_PJE_ORIGEM}${COMUNICA_PJE_CAMINHO}?itensPorPagina=100&numeroProcesso=${cnjDigitos}`
}

function fonteOficialPorProcesso(
  fontes: FonteOficial[],
  numeroCnj: string,
): FonteOficial | undefined {
  const cnjDigitos = numeroCnj.replace(/\D/g, "")
  return fontes.find((fonte) => {
    try {
      const url = new URL(fonte.url)
      return (
        url.protocol === "https:" &&
        url.hostname === "comunicaapi.pje.jus.br" &&
        url.pathname === COMUNICA_PJE_CAMINHO &&
        url.searchParams.getAll("numeroProcesso").length === 1 &&
        url.searchParams.get("numeroProcesso") === cnjDigitos
      )
    } catch {
      return false
    }
  })
}

export function tipoProcessual(
  classe: string,
  familia: string,
): LinhaProcesso["tipo"] {
  const texto = normalizar(`${classe} ${familia}`)
  if (/improbidade/.test(texto)) return "improbidade"
  if (/eleitor|propaganda/.test(texto)) return "eleitoral"
  if (/criminal|penal|inquerito policial|crimes? contra|queixa-crime|difamacao|injuria|calunia/.test(texto)) {
    return "criminal"
  }
  return "civil"
}

function sqlTexto(valor: string): string {
  return `'${valor.replaceAll("'", "''").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()}'`
}

function valoresSql(linhas: LinhaProcesso[]): string {
  return linhas
    .map(
      (linha) =>
        `    (${[
          linha.slug,
          linha.tipo,
          linha.tribunal,
          linha.numero_cnj,
          linha.descricao,
          linha.status,
          linha.fonte,
          linha.url_fonte,
        ]
          .map(sqlTexto)
          .join(", ")})`,
    )
    .join(",\n")
}

function insertsSql(linhas: LinhaProcesso[]): string {
  return linhas
    .map(
      (linha) => `-- @write tabela=processos slug=${linha.slug} campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT
  c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
  NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.slug = l.slug
WHERE l.slug = ${sqlTexto(linha.slug)}
  AND l.numero_cnj = ${sqlTexto(linha.numero_cnj)};`,
    )
    .join("\n\n")
}

function gerarMigration(
  linhas: LinhaProcesso[],
  timestamp: string,
  aprovadoEditorialmente: boolean,
): string {
  const total = linhas.length
  const fichas = new Set(linhas.map((linha) => linha.slug)).size
  const valores = valoresSql(linhas)
  const inserts = insertsSql(linhas)
  return `-- ${timestamp}_processos_curadoria_djen.sql
-- ${aprovadoEditorialmente ? "APROVADO EDITORIALMENTE, NAO APLICADO" : "PREPARADO, NAO APLICADO"}. Lote judicial de 05/08/2026.
-- As contagens explicitas passadas ao gerador precisam coincidir com este lote.
-- Sem BEGIN/COMMIT proprio: o aplicador envolve migration e ledger na mesma transacao.

CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL,
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_cnj text NOT NULL,
  descricao text NOT NULL,
  status text NOT NULL,
  fonte text NOT NULL,
  url_fonte text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_processos_curadoria
  (slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${valores};

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM _pf_processos_curadoria;
  IF n <> ${total} THEN
    RAISE EXCEPTION 'processos curadoria: esperados ${total} CNJs no lote, encontrados %', n;
  END IF;

  SELECT count(DISTINCT slug) INTO n FROM _pf_processos_curadoria;
  IF n <> ${fichas} THEN
    RAISE EXCEPTION 'processos curadoria: esperadas ${fichas} fichas no lote, encontradas %', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria
  WHERE url_fonte LIKE 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?%'
    AND url_fonte <>
    'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=' ||
    regexp_replace(numero_cnj, '[^0-9]', '', 'g');
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % URLs nao provam o proprio CNJ', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria l
  LEFT JOIN public.candidatos c ON c.slug = l.slug
  WHERE c.id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % slugs nao resolvidos em candidatos', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria l
  JOIN public.processos p
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') =
       regexp_replace(l.numero_cnj, '[^0-9]', '', 'g');
  IF n <> 0 THEN
    RAISE EXCEPTION 'processos curadoria: % CNJs ja existem; recusar duplicacao ou lote parcial', n;
  END IF;
END $$;

${inserts}

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.processos
  WHERE fonte LIKE '${MARCADOR_FONTE}: %';
  IF n <> ${total} THEN
    RAISE EXCEPTION 'processos curadoria: esperados ${total} registros inseridos, encontrados %', n;
  END IF;
END $$;
`
}

function gerarRollback(
  linhas: LinhaProcesso[],
  timestamp: string,
  aprovadoEditorialmente: boolean,
): string {
  const total = linhas.length
  const valores = valoresSql(linhas)
  return `-- ROLLBACK CIRURGICO de ${timestamp}_processos_curadoria_djen.sql
-- Executar somente com autorizacao nominal, depois do readback do lote.
-- ${aprovadoEditorialmente ? "A aprovacao editorial nao autoriza executar este rollback" : "PROPOSTA: nao autoriza nem implica aplicacao da migration correspondente"}.
-- Sem BEGIN/COMMIT proprio: executar dentro de transacao externa unica.

CREATE TEMP TABLE _pf_processos_curadoria_rollback (
  slug text NOT NULL,
  tipo text NOT NULL,
  tribunal text NOT NULL,
  numero_cnj text PRIMARY KEY,
  descricao text NOT NULL,
  status text NOT NULL,
  fonte text NOT NULL,
  url_fonte text NOT NULL
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria_rollback
  (slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${valores};

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.processos p
  JOIN _pf_processos_curadoria_rollback l
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') =
       regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  WHERE p.fonte LIKE '${MARCADOR_FONTE}: %';
  IF n <> ${total} THEN
    RAISE EXCEPTION 'rollback processos curadoria: esperados ${total}, encontrados % registros do lote', n;
  END IF;

  SELECT count(*) INTO n
  FROM _pf_processos_curadoria_rollback l
  JOIN public.processos p
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') =
       regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE (c.slug, p.tipo, p.tribunal, p.descricao, p.status, p.fonte, p.url_fonte,
         p.data_inicio, p.data_decisao, p.gravidade)
        IS DISTINCT FROM
        (l.slug, l.tipo, l.tribunal, l.descricao, l.status, l.fonte, l.url_fonte,
         NULL::date, NULL::date, NULL::text);
  IF n <> 0 THEN
    RAISE EXCEPTION 'rollback processos curadoria: % registro(s) divergem do lote aplicado; preservar curadoria posterior', n;
  END IF;
END $$;

DELETE FROM public.processos p
USING _pf_processos_curadoria_rollback l
WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') =
      regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  AND p.fonte LIKE '${MARCADOR_FONTE}: %';

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.processos
  WHERE fonte LIKE '${MARCADOR_FONTE}: %';
  IF n <> 0 THEN
    RAISE EXCEPTION 'rollback processos curadoria: ainda restam % registros do lote', n;
  END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '${timestamp}';
`
}

function gerarReadback(linhas: LinhaProcesso[], timestamp: string): string {
  const esperados = linhas
    .map(
      (linha) => {
        const identidade = IDENTIDADE_HISTORICA_POR_CNJ.get(linha.numero_cnj.replace(/\D/g, ""))
        const identidadeSql = identidade
          ? [
              sqlTexto(identidade.candidatoId),
              sqlTexto(identidade.nomeCompleto),
              sqlTexto(identidade.nomeUrna),
              sqlTexto(identidade.slugPosSplit),
            ]
          : ["NULL", "NULL", "NULL", "NULL"]
        return `    (${[
          linha.slug,
          linha.tipo,
          linha.tribunal,
          linha.numero_cnj,
          linha.descricao,
          linha.status,
          linha.fonte,
          linha.url_fonte,
        ]
          .map(sqlTexto)
          .concat(identidadeSql)
          .join(", ")})`
      },
    )
    .join(",\n")
  return `-- READBACK SOMENTE LEITURA de ${timestamp}_processos_curadoria_djen.sql
-- Rodar depois da aplicacao autorizada e antes de qualquer deploy.
CREATE TEMP TABLE pf_readback_judicial_69 AS
WITH expected_base(
  slug, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte,
  expected_candidate_id, expected_nome_completo, expected_nome_urna, expected_slug_pos_split
) AS (VALUES
${esperados}
), identity_resolution AS (
  SELECT e.numero_cnj,
         count(c.id) AS identity_matches,
         min(c.id::text)::uuid AS candidato_id
  FROM expected_base e
  LEFT JOIN public.candidatos c ON (
    (e.expected_candidate_id IS NULL AND c.slug = e.slug)
    OR (
      e.expected_candidate_id IS NOT NULL
      AND c.id = e.expected_candidate_id::uuid
      AND c.nome_completo = e.expected_nome_completo
      AND c.nome_urna = e.expected_nome_urna
      AND (
        (NOT EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '${SPLIT_IDENTIDADE_VERSION}'
        ) AND c.slug = e.slug)
        OR
        (EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '${SPLIT_IDENTIDADE_VERSION}'
        ) AND c.slug = e.expected_slug_pos_split)
      )
    )
  )
  GROUP BY e.numero_cnj
), expected AS (
  SELECT e.*, r.identity_matches, r.candidato_id
  FROM expected_base e
  JOIN identity_resolution r USING (numero_cnj)
), actual AS (
  SELECT c.id AS candidato_id, c.slug, p.tipo, p.tribunal, p.numero_processo AS numero_cnj,
         p.descricao, p.status, p.data_inicio, p.data_decisao, p.gravidade,
         p.fonte, p.url_fonte
  FROM public.processos p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE p.fonte LIKE '${MARCADOR_FONTE}: %'
)
SELECT
  (SELECT count(*) FROM expected) AS expected_rows,
  (SELECT count(DISTINCT slug) FROM expected) AS expected_candidates,
  (SELECT count(*) FROM actual) AS actual_rows,
  (SELECT count(DISTINCT candidato_id) FROM actual) AS actual_candidates,
  (SELECT count(*) FROM expected WHERE identity_matches <> 1) AS identity_mismatch,
  (SELECT count(*) FROM expected e LEFT JOIN actual a
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE a.numero_cnj IS NULL) AS missing_expected,
  (SELECT count(*) FROM actual a LEFT JOIN expected e
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE e.numero_cnj IS NULL) AS unexpected_marker,
  (SELECT count(*) FROM expected e
   WHERE (SELECT count(*) FROM public.processos p
          WHERE regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1
      OR (SELECT count(*) FROM public.processos p JOIN public.candidatos c ON c.id = p.candidato_id
          WHERE c.id = e.candidato_id
            AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1) AS global_cnj_mismatch,
  (SELECT count(*) FROM expected e JOIN actual a
     ON a.candidato_id = e.candidato_id
    AND regexp_replace(a.numero_cnj, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')
   WHERE (a.numero_cnj, a.tipo, a.tribunal, a.descricao, a.status, a.fonte, a.url_fonte)
         IS DISTINCT FROM
         (e.numero_cnj, e.tipo, e.tribunal, e.descricao, e.status, e.fonte, e.url_fonte)) AS payload_mismatch,
  (SELECT count(*) FROM actual
   WHERE data_inicio IS NOT NULL OR data_decisao IS NOT NULL OR gravidade IS NOT NULL) AS inferred_fields,
  (SELECT count(*) FROM actual
   WHERE url_fonte IS NULL OR url_fonte !~ '^https://') AS invalid_source_urls,
  (SELECT count(*) FROM actual
   WHERE url_fonte LIKE 'https://comunicaapi.pje.jus.br/api/v1/comunicacao?%'
     AND url_fonte <>
     'https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=100&numeroProcesso=' ||
     regexp_replace(numero_cnj, '[^0-9]', '', 'g')) AS source_cnj_mismatch;

DO $readback$
DECLARE r pf_readback_judicial_69%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM pf_readback_judicial_69;
  IF r.expected_rows <> 69 OR r.expected_candidates <> 21
     OR r.actual_rows <> 69 OR r.actual_candidates <> 21
     OR r.identity_mismatch <> 0 OR r.missing_expected <> 0
     OR r.unexpected_marker <> 0 OR r.global_cnj_mismatch <> 0
     OR r.payload_mismatch <> 0 OR r.inferred_fields <> 0
     OR r.invalid_source_urls <> 0 OR r.source_cnj_mismatch <> 0 THEN
    RAISE EXCEPTION 'readback 20260810122000: %', row_to_json(r);
  END IF;
END
$readback$;

TABLE pf_readback_judicial_69;
`
}

export function prepararPacoteProcessos(entrada: EntradaPacote) {
  if (!/^\d{14}$/.test(entrada.timestamp)) throw new Error("timestamp invalido")
  const aprovados = entrada.itensRevisao.filter(
    (item) => item.decisao === "publicar" || item.decisao === "ponto_atencao",
  )
  if (aprovados.length !== entrada.esperadoProcessos) {
    throw new Error(
      `evidencia aprovada tem ${aprovados.length} processos; matriz exige ${entrada.esperadoProcessos}`,
    )
  }
  const fichas = new Set(aprovados.map((item) => item.slug))
  if (fichas.size !== entrada.esperadoFichas) {
    throw new Error(`evidencia aprovada tem ${fichas.size} fichas; matriz exige ${entrada.esperadoFichas}`)
  }

  const vistos = new Set<string>()
  const curadoriaPorCnj = new Map(entrada.processosCuradoria.map((item) => [item.numero_cnj, item]))
  const linhas: LinhaProcesso[] = aprovados.map((item) => {
    if (vistos.has(item.numero_cnj)) throw new Error(`CNJ duplicado: ${item.numero_cnj}`)
    vistos.add(item.numero_cnj)
    if (!cnjValido(item.numero_cnj)) {
      throw new Error(`CNJ invalido: ${item.numero_cnj}`)
    }
    if (!item.identidade_confirmada) throw new Error(`${item.numero_cnj}: identidade nao confirmada`)
    const primeiraFonteHttps = item.fontes_oficiais.find((origem) => /^https:\/\//.test(origem.url))
    if (!primeiraFonteHttps) throw new Error(`${item.numero_cnj}: fonte oficial ausente`)
    const processo = curadoriaPorCnj.get(item.numero_cnj)
    if (!processo) throw new Error(`${item.numero_cnj}: processo ausente na evidencia DJEN`)
    urlComunicaPjePorCnj(processo.url, item.numero_cnj)
    const fonte = fonteOficialPorProcesso(item.fontes_oficiais, item.numero_cnj) ?? primeiraFonteHttps
    let urlFonte = fonte.url
    try {
      const url = new URL(fonte.url)
      if (url.hostname === "comunicaapi.pje.jus.br") {
        urlFonte = urlComunicaPjePorCnj(fonte.url, item.numero_cnj)
      }
    } catch {
      throw new Error(`${item.numero_cnj}: fonte oficial invalida`)
    }
    if (!item.motivo?.trim() || !item.estado_oficial?.trim()) {
      throw new Error(`${item.numero_cnj}: descricao ou estado oficial ausente`)
    }
    return {
      slug: item.slug,
      numero_cnj: item.numero_cnj,
      tipo: tipoProcessual(processo.classe, item.familia_processual ?? ""),
      tribunal: processo.tribunal,
      descricao: item.motivo,
      status: item.estado_oficial,
      fonte: `${MARCADOR_FONTE}: ${fonte.titulo}`,
      url_fonte: urlFonte,
    }
  })

  const campos = [
    "candidato_id",
    "tipo",
    "tribunal",
    "numero_processo",
    "descricao",
    "status",
    "data_inicio",
    "data_decisao",
    "gravidade",
    "fonte",
    "url_fonte",
  ]
  const allowlist = {
    _comentario:
      entrada.aprovadoEditorialmente
        ? "LOTE APROVADO EDITORIALMENTE E NAO APLICADO: a allowlist autoriza somente as 69 escritas nominais desta migration; aplicar continua sendo ato externo separado."
        : "PROPOSTA NAO APLICADA: integrar ao gate somente apos aprovacao nominal deste lote.",
    recorte: "processos-curadoria-djen-20260810",
    migration: `${entrada.timestamp}_processos_curadoria_djen.sql`,
    coorte: [...new Set(linhas.map((linha) => linha.slug))].sort(),
    fora_por_construcao: { slugs: [] as string[] },
    entries: [...new Set(linhas.map((linha) => linha.slug))]
      .sort()
      .map((slug) => ({
        tabela: "processos",
        slug,
        campos,
        max_registros: linhas.filter((linha) => linha.slug === slug).length,
      })),
  }
  return {
    linhas,
    migration: gerarMigration(linhas, entrada.timestamp, entrada.aprovadoEditorialmente === true),
    rollback: gerarRollback(linhas, entrada.timestamp, entrada.aprovadoEditorialmente === true),
    readback: gerarReadback(linhas, entrada.timestamp),
    allowlist,
    manifesto: JSON.stringify(
      {
        schema_version: 1,
        timestamp_reservado: entrada.timestamp,
        estado: entrada.aprovadoEditorialmente
          ? "aprovado_editorialmente_nao_aplicado"
          : "proposta_nao_aplicada",
        processos: linhas.length,
        fichas: new Set(linhas.map((linha) => linha.slug)).size,
        linhas,
      },
      null,
      2,
    ) + "\n",
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const valor = (nome: string) => args.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const migration = valor("migration")
  const rollback = valor("rollback")
  if (!migration || !rollback) throw new Error("--migration e --rollback sao obrigatorios")
  const processosEsperados = valor("expected-processes")
  const fichasEsperadas = valor("expected-candidates")
  if (!processosEsperados || !fichasEsperadas) {
    throw new Error(
      "--expected-processes e --expected-candidates sao obrigatorios; nao inferir contagem entre manifestos complementares",
    )
  }
  const revisaoPath =
    valor("review") ??
    resolve(homedir(), ".disposable-html/2026-08-05-puxa-ficha-processos-revisao-final.evidence.json")
  const curadoriaPath =
    valor("evidence") ??
    resolve(homedir(), ".disposable-html/2026-08-05-puxa-ficha-processos-curadoria.evidence.json")
  const revisao = JSON.parse(readFileSync(revisaoPath, "utf8")) as { itens: ItemRevisao[] }
  const curadoria = JSON.parse(readFileSync(curadoriaPath, "utf8")) as {
    lotes: Array<{ candidatos: Array<{ processos: ProcessoCuradoria[] }> }>
  }
  const pacote = prepararPacoteProcessos({
    itensRevisao: revisao.itens,
    processosCuradoria: curadoria.lotes.flatMap((lote) =>
      lote.candidatos.flatMap((candidato) => candidato.processos),
    ),
    esperadoProcessos: Number(processosEsperados),
    esperadoFichas: Number(fichasEsperadas),
    timestamp: valor("timestamp") ?? "20260810122000",
    aprovadoEditorialmente: valor("approved-editorially") === "true",
  })
  writeFileSync(migration, pacote.migration)
  writeFileSync(rollback, pacote.rollback)
  const readback = valor("readback")
  if (readback) writeFileSync(readback, pacote.readback)
  const manifesto = valor("manifest")
  if (manifesto) writeFileSync(manifesto, pacote.manifesto)
  const allowlist = valor("allowlist")
  if (allowlist) writeFileSync(allowlist, `${JSON.stringify(pacote.allowlist, null, 2)}\n`)
  console.log(`migration preparada: ${migration} (${pacote.linhas.length} processos)`)
  console.log(`rollback preparado: ${rollback}`)
  if (readback) console.log(`readback preparado: ${readback}`)
  if (manifesto) console.log(`manifesto preparado: ${manifesto}`)
  if (allowlist) console.log(`allowlist proposta: ${allowlist}`)
}

const executadoDiretamente = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false

if (executadoDiretamente) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  }
}
