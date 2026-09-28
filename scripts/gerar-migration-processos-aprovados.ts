/** Prepara um lote editorial aprovado a partir de evidência privada e DJEN público. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import {
  cnjValido,
  formatarCnj,
  processoDeFamiliaOuSegredo,
  tipoProcessual,
} from "./gerar-migration-processos-curadoria"

const STATUS = "comunicacao_processual_publicada_merito_nao_inferido"
const FONTE_LOG = "processos-curadoria"
const ESCOPO_LOG = "candidato"
const RESULTADO_LOG = "encontrado"
const VERSAO = "20260928010000"
const NOME = "processos_l13_senado"

export interface Aprovado {
  slug: string
  candidato_id: string
  numero_cnj: string
  tribunal: string
  classe: string
  orgao: string
  polo: "A" | "P" | null
  papel: string
  tipo: string
  decisao_mesa: string
}

export interface ProcessoEvidencia {
  slug: string
  numero_cnj: string
  tribunal: string
  classe: string
  orgao: string
  polo: string | null
}

export interface ComunicacaoDjen {
  numero_processo: string
  data_disponibilizacao: string
  tipoComunicacao: string
  nomeClasse?: string
  nomeOrgao?: string
}

interface Linha {
  slug: string
  candidatoId: string
  numero: string
  tribunal: string
  tipo: string
  descricao: string
  fonte: string
  url: string
}

const digitos = (numero: string) => numero.replace(/\D/g, "")
const sql = (value: string) => `'${value.replaceAll("'", "''").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim()}'`

function poloDoItem(item: Aprovado): "ativo" | "passivo" {
  if (item.polo === "A") return "ativo"
  if (item.polo === "P") return "passivo"
  // Em registros sem polo no DJEN, a decisão editorial registra a parte.
  if (item.polo === null && item.papel === "parte_ativa") return "ativo"
  if (item.polo === null && item.papel === "parte_passiva") return "passivo"
  throw new Error(`${item.numero_cnj}: polo ausente ou invalido`)
}

export function validarAprovados(
  aprovados: Aprovado[],
  evidencia: ProcessoEvidencia[],
  expectedProcesses: number,
  expectedCandidates: number,
): Aprovado[] {
  if (!Number.isInteger(expectedProcesses) || expectedProcesses < 1 || aprovados.length !== expectedProcesses) {
    throw new Error(`processos aprovados: ${aprovados.length}; esperado: ${expectedProcesses}`)
  }
  if (!Number.isInteger(expectedCandidates) || expectedCandidates < 1 || new Set(aprovados.map((x) => x.slug)).size !== expectedCandidates) {
    throw new Error(`candidatos aprovados: ${new Set(aprovados.map((x) => x.slug)).size}; esperado: ${expectedCandidates}`)
  }
  const vistos = new Set<string>()
  const idsPorSlug = new Map<string, string>()
  const evidencias = new Map(evidencia.map((x) => [`${x.slug}:${digitos(x.numero_cnj)}`, x]))
  for (const item of aprovados) {
    if (!cnjValido(item.numero_cnj)) throw new Error(`${item.numero_cnj}: CNJ invalido`)
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item.candidato_id)) throw new Error(`${item.numero_cnj}: candidato_id invalido`)
    if (!item.slug || !item.decisao_mesa || !item.tribunal || !item.classe || !item.orgao) throw new Error(`${item.numero_cnj}: aprovacao incompleta`)
    const chave = `${item.slug}:${digitos(item.numero_cnj)}`
    if (vistos.has(chave)) throw new Error(`${item.numero_cnj}: par slug/CNJ duplicado`)
    vistos.add(chave)
    if (idsPorSlug.has(item.slug) && idsPorSlug.get(item.slug) !== item.candidato_id) throw new Error(`${item.slug}: candidato_id divergente`)
    idsPorSlug.set(item.slug, item.candidato_id)
    const prova = evidencias.get(chave)
    if (!prova || prova.tribunal !== item.tribunal || prova.classe !== item.classe || prova.orgao !== item.orgao || prova.polo !== item.polo) {
      throw new Error(`${item.numero_cnj}: evidencia de reexame ausente ou divergente`)
    }
    if (processoDeFamiliaOuSegredo(item.classe, "", item.orgao)) throw new Error(`${item.numero_cnj}: direito de familia ou segredo de justica`)
    if (item.tipo !== tipoProcessual(item.classe, "")) throw new Error(`${item.numero_cnj}: tipo divergente da classe`)
    poloDoItem(item)
  }
  return [...aprovados].sort((a, b) => a.slug.localeCompare(b.slug) || a.numero_cnj.localeCompare(b.numero_cnj))
}

export function resumoComunicacoes(numero: string, comunicacoes: ComunicacaoDjen[]) {
  if (!comunicacoes.length) throw new Error(`${numero}: DJEN sem comunicacoes`)
  const datas = new Set<string>()
  const tipos = new Set<string>()
  for (const item of comunicacoes) {
    if (digitos(item.numero_processo) !== digitos(numero)) throw new Error(`${numero}: comunicacao de outro CNJ`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.data_disponibilizacao) || Number.isNaN(Date.parse(item.data_disponibilizacao))) throw new Error(`${numero}: data DJEN invalida`)
    if (!item.tipoComunicacao?.trim()) throw new Error(`${numero}: tipo de comunicacao ausente`)
    if (processoDeFamiliaOuSegredo(item.nomeClasse ?? "", "", item.nomeOrgao ?? "")) throw new Error(`${numero}: direito de familia ou segredo de justica`)
    datas.add(item.data_disponibilizacao)
    tipos.add(item.tipoComunicacao.trim())
  }
  const ordenadas = [...datas].sort()
  return { tipos: [...tipos].sort((a, b) => a.localeCompare(b, "pt-BR")), primeira: ordenadas[0], ultima: ordenadas.at(-1)! }
}

export function prepararLinhas(
  aprovados: Aprovado[],
  comunicacoes: Map<string, ComunicacaoDjen[]>,
  marcador: string,
): Linha[] {
  if (!/^curadoria-djen-\d{8}$/.test(marcador)) throw new Error("marcador invalido")
  return aprovados.map((item) => {
    const numero = formatarCnj(item.numero_cnj)
    const periodo = resumoComunicacoes(numero, comunicacoes.get(digitos(numero)) ?? [])
    const polo = poloDoItem(item)
    const descricao = `O DJEN registra comunicação processual oficial no processo ${numero}, nas classes ${item.classe}, perante ${item.orgao} (${item.tribunal}). O candidato consta no polo ${polo}. As comunicações ${periodo.tipos.join(" e ")} foram disponibilizadas entre ${periodo.primeira} e ${periodo.ultima}. A publicação comprova a ocorrência e o vínculo processual, mas não informa, por si só, mérito, culpa ou desfecho.`
    return {
      slug: item.slug,
      candidatoId: item.candidato_id,
      numero,
      tribunal: item.tribunal,
      tipo: item.tipo,
      descricao,
      fonte: `${marcador}: Comunicações processuais oficiais do DJEN/CNJ - processo ${numero}`,
      url: `https://comunica.pje.jus.br/consulta?numeroProcesso=${digitos(numero)}`,
    }
  })
}

function dadosSql(linhas: Linha[]) {
  return linhas.map((x) => `    (${[x.slug, x.candidatoId, x.tipo, x.tribunal, x.numero, x.descricao, STATUS, x.fonte, x.url].map(sql).join(", ")})`).join(",\n")
}

function recibosSql(linhas: Linha[]) {
  const porSlug = new Map<string, Linha[]>()
  for (const linha of linhas) porSlug.set(linha.slug, [...(porSlug.get(linha.slug) ?? []), linha])
  return [...porSlug.values()].map((xs) => `    (${sql(xs[0].slug)}, ${sql(xs[0].candidatoId)}::uuid, ${xs.length}, ${sql(xs[0].url)})`).join(",\n")
}

export function gerarSql(linhas: Linha[], marcador: string) {
  const dados = dadosSql(linhas)
  const recibos = recibosSql(linhas)
  const total = linhas.length
  const candidatos = new Set(linhas.map((x) => x.slug)).size
  const tabela = `CREATE TEMP TABLE _pf_processos_curadoria (
  slug text NOT NULL, candidato_id uuid NOT NULL, tipo text NOT NULL,
  tribunal text NOT NULL, numero_cnj text NOT NULL, descricao text NOT NULL,
  status text NOT NULL, fonte text NOT NULL, url_fonte text NOT NULL,
  PRIMARY KEY (slug, numero_cnj)
) ON COMMIT DROP;
INSERT INTO _pf_processos_curadoria
  (slug, candidato_id, tipo, tribunal, numero_cnj, descricao, status, fonte, url_fonte)
VALUES
${dados};`
  const inserts = linhas.map((linha) => `-- @write tabela=processos slug=${linha.slug} campos=candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,data_decisao,gravidade,fonte,url_fonte
INSERT INTO public.processos
  (candidato_id, tipo, tribunal, numero_processo, descricao, status,
   data_inicio, data_decisao, gravidade, fonte, url_fonte)
SELECT c.id, l.tipo, l.tribunal, l.numero_cnj, l.descricao, l.status,
       NULL, NULL, NULL, l.fonte, l.url_fonte
FROM _pf_processos_curadoria l
JOIN public.candidatos c ON c.id = l.candidato_id AND c.slug = l.slug
WHERE l.slug = ${sql(linha.slug)} AND l.numero_cnj = ${sql(linha.numero)}
  AND NOT EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.candidato_id = c.id
      AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  );`).join("\n\n")
  const migration = `-- ${VERSAO}_${NOME}.sql
-- APROVADO EDITORIALMENTE, NAO APLICADO. Lote judicial ${marcador}.
-- Sem BEGIN/COMMIT proprio: migration, ledger e readback pertencem a uma transacao externa.

${tabela}

DO $$
DECLARE n integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN RETURN; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria;
  IF n <> ${total} THEN RAISE EXCEPTION 'processos: esperados ${total} CNJs, encontrados %', n; END IF;
  SELECT count(DISTINCT slug) INTO n FROM _pf_processos_curadoria;
  IF n <> ${candidatos} THEN RAISE EXCEPTION 'processos: esperadas ${candidatos} fichas, encontradas %', n; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria l LEFT JOIN public.candidatos c
    ON c.id = l.candidato_id AND c.slug = l.slug WHERE c.id IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'processos: % identidades divergentes', n; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria l JOIN public.processos p
    ON regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
   AND p.candidato_id <> l.candidato_id;
  IF n <> 0 THEN RAISE EXCEPTION 'processos: % CNJs vinculados a outra ficha', n; END IF;
END $$;

${inserts}

-- @write tabela=coleta_log ref=migration:${VERSAO} campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao, natureza)
SELECT ${sql(FONTE_LOG)}, ${sql(ESCOPO_LOG)}, r.slug, r.candidato_id, ${sql(RESULTADO_LOG)}, r.volume,
       r.volume || ' processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 28/09/2026',
       r.url, ${sql(`migration:${VERSAO}`)}, 'coleta'
FROM (VALUES
${recibos}
) AS r(slug, candidato_id, volume, url)
JOIN public.candidatos c ON c.slug = r.slug AND c.id = r.candidato_id
WHERE current_setting('pf.replay', true) IS DISTINCT FROM 'true'
  AND NOT EXISTS (SELECT 1 FROM public.coleta_log x
    WHERE x.execucao = ${sql(`migration:${VERSAO}`)} AND x.fonte = ${sql(FONTE_LOG)} AND x.escopo = ${sql(ESCOPO_LOG)} AND x.alvo = r.slug);

DO $$
DECLARE n integer;
BEGIN
  IF current_setting('pf.replay', true) = 'true' OR NOT EXISTS (SELECT 1 FROM public.candidatos) THEN RETURN; END IF;
  SELECT count(*) INTO n FROM _pf_processos_curadoria l
  WHERE (SELECT count(*) FROM public.processos p WHERE p.candidato_id = l.candidato_id
    AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')) <> 1;
  IF n <> 0 THEN RAISE EXCEPTION 'processos: % CNJs ausentes ou duplicados', n; END IF;
  SELECT count(*) INTO n FROM public.coleta_log WHERE execucao = ${sql(`migration:${VERSAO}`)}
    AND fonte = ${sql(FONTE_LOG)} AND escopo = ${sql(ESCOPO_LOG)} AND resultado = ${sql(RESULTADO_LOG)};
  IF n <> ${candidatos} THEN RAISE EXCEPTION 'processos: esperados ${candidatos} recibos, encontrados %', n; END IF;
END $$;
`
  const rollback = `-- ROLLBACK CIRURGICO de ${VERSAO}_${NOME}.sql
-- Executar somente com autorizacao nominal e transacao externa unica.
${tabela.replaceAll("_pf_processos_curadoria", "_pf_processos_curadoria_rollback")}

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.processos p JOIN _pf_processos_curadoria_rollback l
    ON p.candidato_id = l.candidato_id
   AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  WHERE p.fonte = l.fonte
    AND (p.tipo, p.tribunal, p.descricao, p.status, p.url_fonte, p.data_inicio, p.data_decisao, p.gravidade)
      IS DISTINCT FROM (l.tipo, l.tribunal, l.descricao, l.status, l.url_fonte, NULL::date, NULL::date, NULL::text);
  IF n <> 0 THEN RAISE EXCEPTION 'rollback processos: % linhas alteradas apos publicacao', n; END IF;
  SELECT count(*) INTO n FROM public.coleta_log q
  WHERE q.execucao = ${sql(`migration:${VERSAO}`)} AND q.fonte = ${sql(FONTE_LOG)} AND q.escopo = ${sql(ESCOPO_LOG)};
  IF n <> ${candidatos} THEN RAISE EXCEPTION 'rollback processos: esperados ${candidatos} recibos, encontrados %', n; END IF;
  SELECT count(*) INTO n FROM public.coleta_log q LEFT JOIN
    (SELECT slug, candidato_id, count(*)::integer AS volume FROM _pf_processos_curadoria_rollback GROUP BY slug, candidato_id) e
    ON e.slug = q.alvo AND e.candidato_id = q.candidato_id
  WHERE q.execucao = ${sql(`migration:${VERSAO}`)} AND q.fonte = ${sql(FONTE_LOG)} AND q.escopo = ${sql(ESCOPO_LOG)}
    AND (e.slug IS NULL OR q.resultado IS DISTINCT FROM ${sql(RESULTADO_LOG)}
      OR q.volume IS DISTINCT FROM e.volume
      OR q.detalhe IS DISTINCT FROM e.volume || ' processo(s) com número CNJ, contexto oficial de identidade e parte na ação; revisão editorial em 28/09/2026'
      OR NOT EXISTS (SELECT 1 FROM _pf_processos_curadoria_rollback l
        WHERE l.slug = q.alvo AND l.candidato_id = q.candidato_id AND l.url_fonte = q.url));
  IF n <> 0 THEN RAISE EXCEPTION 'rollback processos: % recibos divergentes; preservar revisao posterior', n; END IF;
END $$;

DELETE FROM public.coleta_log q USING
  (SELECT slug, candidato_id, count(*)::integer AS volume FROM _pf_processos_curadoria_rollback GROUP BY slug, candidato_id) e
WHERE q.execucao = ${sql(`migration:${VERSAO}`)}
  AND q.fonte = ${sql(FONTE_LOG)} AND q.escopo = ${sql(ESCOPO_LOG)}
  AND q.alvo = e.slug AND q.candidato_id = e.candidato_id
  AND q.resultado = ${sql(RESULTADO_LOG)} AND q.volume = e.volume;
DELETE FROM public.processos p USING _pf_processos_curadoria_rollback l
WHERE p.candidato_id = l.candidato_id
  AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  AND p.fonte = l.fonte;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.coleta_log q
  WHERE q.execucao = ${sql(`migration:${VERSAO}`)} AND q.fonte = ${sql(FONTE_LOG)} AND q.escopo = ${sql(ESCOPO_LOG)};
  IF n <> 0 THEN RAISE EXCEPTION 'rollback processos: % recibos restantes', n; END IF;
  SELECT count(*) INTO n FROM public.processos p JOIN _pf_processos_curadoria_rollback l
    ON p.candidato_id = l.candidato_id
   AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(l.numero_cnj, '[^0-9]', '', 'g')
  WHERE p.fonte = l.fonte;
  IF n <> 0 THEN RAISE EXCEPTION 'rollback processos: % linhas do lote restantes', n; END IF;
END $$;
DELETE FROM supabase_migrations.schema_migrations WHERE version = ${sql(VERSAO)};
`
  const readback = `-- READBACK SOMENTE LEITURA de ${VERSAO}_${NOME}.sql
DO $readback$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE version = ${sql(VERSAO)};
  IF n <> 1 THEN RAISE EXCEPTION 'readback processos: ledger=%', n; END IF;
  WITH expected(slug, candidato_id, numero_cnj) AS (VALUES
${linhas.map((x) => `    (${sql(x.slug)}, ${sql(x.candidatoId)}::uuid, ${sql(x.numero)})`).join(",\n")}
  ) SELECT count(*) INTO n FROM expected e WHERE
    (SELECT count(*) FROM public.candidatos c JOIN public.processos p ON p.candidato_id = c.id
      WHERE c.id = e.candidato_id AND c.slug = e.slug
        AND regexp_replace(p.numero_processo, '[^0-9]', '', 'g') = regexp_replace(e.numero_cnj, '[^0-9]', '', 'g')) <> 1;
  IF n <> 0 THEN RAISE EXCEPTION 'readback processos: % CNJs ausentes ou duplicados (esperados ${total})', n; END IF;
  WITH expected(slug, candidato_id, volume, url) AS (VALUES
${recibos}
  ) SELECT count(*) INTO n FROM expected e JOIN public.coleta_log_ultima l
    ON l.fonte = ${sql(FONTE_LOG)} AND l.escopo = ${sql(ESCOPO_LOG)} AND l.alvo = e.slug
   AND l.candidato_id = e.candidato_id AND l.resultado = ${sql(RESULTADO_LOG)}
   AND l.volume = e.volume AND l.url = e.url AND l.execucao = ${sql(`migration:${VERSAO}`)};
  IF n <> ${candidatos} THEN RAISE EXCEPTION 'readback processos: recibos atuais=% (esperados ${candidatos})', n; END IF;
  RAISE NOTICE 'readback processos: ${total} CNJs e ${candidatos} recibos atuais conferidos';
END
$readback$;
`
  return { migration, rollback, readback, counts: { processos: total, candidatos } }
}

async function buscarComunicacoes(numero: string, cacheDir: string): Promise<ComunicacaoDjen[]> {
  const digits = digitos(numero)
  const cachePath = resolve(cacheDir, `${digits}.json`)
  if (existsSync(cachePath)) {
    const salvo = JSON.parse(readFileSync(cachePath, "utf8")) as { numero: string; items: ComunicacaoDjen[] }
    if (salvo.numero !== digits || !Array.isArray(salvo.items)) throw new Error(`${numero}: cache DJEN invalido`)
    return salvo.items
  }
  const items: ComunicacaoDjen[] = []
  let count = -1
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?itensPorPagina=1000&numeroProcesso=${digits}&pagina=${pagina}`
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${numero}: DJEN HTTP ${response.status}`)
    const data = await response.json() as { count?: number; items?: ComunicacaoDjen[] }
    if (!Number.isInteger(data.count) || !Array.isArray(data.items)) throw new Error(`${numero}: resposta DJEN invalida`)
    if (count >= 0 && count !== data.count) throw new Error(`${numero}: total DJEN mudou durante paginacao`)
    count = data.count!
    if (count > 20_000) throw new Error(`${numero}: DJEN excede limite paginavel`)
    items.push(...data.items)
    if (items.length >= count) break
    if (!data.items.length) throw new Error(`${numero}: pagina DJEN vazia antes do total`)
  }
  if (items.length !== count) throw new Error(`${numero}: DJEN truncado (${items.length}/${count})`)
  resumoComunicacoes(numero, items)
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(cachePath, `${JSON.stringify({ numero: digits, count, items }, null, 2)}\n`)
  return items
}

async function main() {
  const args = process.argv.slice(2)
  const valor = (nome: string) => args.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3)
  const approved = valor("approved")
  const evidence = valor("evidence")?.split(",")
  const cache = valor("cache")
  const migration = valor("migration")
  const rollback = valor("rollback")
  const readback = valor("readback")
  const expectedProcesses = Number(valor("expected-processes"))
  const expectedCandidates = Number(valor("expected-candidates"))
  const marker = valor("marker")
  if (!approved || !evidence?.length || !cache || !migration || !rollback || !readback || !marker) throw new Error("--approved, --evidence, --cache, --migration, --rollback, --readback e --marker sao obrigatorios")
  const lista = JSON.parse(readFileSync(approved, "utf8")) as { aprovados: Aprovado[] }
  if (!Array.isArray(lista.aprovados)) throw new Error("lista aprovada invalida")
  const provas = evidence.flatMap((path) => {
    const x = JSON.parse(readFileSync(path, "utf8")) as { lotes: Array<{ candidatos: Array<{ slug: string; processos: Omit<ProcessoEvidencia, "slug">[] }> }> }
    return x.lotes.flatMap((lote) => lote.candidatos.flatMap((candidato) => candidato.processos.map((p) => ({ ...p, slug: candidato.slug }))))
  })
  const aprovados = validarAprovados(lista.aprovados, provas, expectedProcesses, expectedCandidates)
  const porNumero = new Map<string, ComunicacaoDjen[]>()
  for (const item of aprovados) {
    const numero = digitos(item.numero_cnj)
    if (!porNumero.has(numero)) porNumero.set(numero, await buscarComunicacoes(numero, cache))
  }
  const linhas = prepararLinhas(aprovados, porNumero, marker)
  const pacote = gerarSql(linhas, marker)
  for (const [path, value] of [[migration, pacote.migration], [rollback, pacote.rollback], [readback, pacote.readback]] as const) {
    mkdirSync(dirname(resolve(path)), { recursive: true })
    writeFileSync(path, value)
  }
  console.log(`migration preparada: ${pacote.counts.processos} processos, ${pacote.counts.candidatos} candidatos; DJEN por numero em cache privado`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2 })
}
