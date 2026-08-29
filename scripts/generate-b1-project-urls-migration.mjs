import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const sourcePath = resolve(process.argv[2] ?? "")
const outputPath = resolve(process.argv[3] ?? "")
if (!process.argv[2] || !process.argv[3]) {
  throw new Error("uso: node scripts/generate-b1-project-urls-migration.mjs <proposals.jsonl> <migration.sql>")
}

const source = readFileSync(sourcePath, "utf8")
const profiles = source.trim().split(/\r?\n/).map((line) => JSON.parse(line))
const mappings = profiles.flatMap((profile) =>
  profile.proposals
    .filter(
      (proposal) =>
        proposal.field === "legislative_projects.url_inteiro_teor" &&
        [
          "url_oficial_deterministica_proposta",
          "parcial_url_oficial_deterministica",
        ].includes(proposal.proposed_state),
    )
    .flatMap((proposal) =>
      proposal.proposed_value.mappings
        .filter((mapping) => mapping.proposicao_id_api && mapping.proposed_public_url)
        .map((mapping) => ({
          slug: profile.candidate_slug,
          ...mapping,
        })),
    ),
)

if (profiles.length !== 194 || mappings.length !== 3595) {
  throw new Error(`fila inesperada: perfis=${profiles.length}, urls=${mappings.length}`)
}

const unique = new Set(mappings.map((mapping) => `${mapping.slug}|${mapping.fonte}|${mapping.proposicao_id_api}`))
if (unique.size !== mappings.length) {
  throw new Error(`mapeamentos duplicados: ${mappings.length - unique.size}`)
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const values = mappings.map((mapping) =>
  `  (${quote(mapping.slug)}, ${quote(mapping.proposicao_id_api)}, ${quote(mapping.fonte)}, ${quote(mapping.proposed_public_url)})`,
).join(",\n")
const sourceHash = createHash("sha256").update(source).digest("hex")

const sql = `BEGIN;

-- 3.595 URLs oficiais determinísticas geradas por proposicao_id_api.
-- Execucao: pf-completeness-20260807T022551Z
-- SHA-256 do ledger B1: ${sourceHash}
-- A unica pendencia (Senado PL 4444/2015 sem ID) permanece inalterada.

CREATE TEMP TABLE _pf_project_urls (
  slug text NOT NULL,
  proposicao_id_api text NOT NULL,
  fonte text NOT NULL,
  public_url text NOT NULL,
  PRIMARY KEY (slug, fonte, proposicao_id_api)
) ON COMMIT DROP;

-- @write tabela=_pf_project_urls ref=B1-projetos-20260807 campos=slug,proposicao_id_api,fonte,public_url
INSERT INTO _pf_project_urls
SELECT *
FROM (VALUES
${values}
) AS source(slug, proposicao_id_api, fonte, public_url)
WHERE 'B1-projetos-20260807' = 'B1-projetos-20260807';

DO $guard$
DECLARE
  matched integer;
BEGIN
  IF (SELECT count(*) FROM _pf_project_urls) <> 3595 THEN
    RAISE EXCEPTION 'B1 URLs: cardinalidade diferente de 3595';
  END IF;

  SELECT count(*) INTO matched
  FROM _pf_project_urls d
  JOIN public.candidatos c ON c.slug = d.slug
  JOIN public.projetos_lei p
    ON p.candidato_id = c.id
   AND p.proposicao_id_api = d.proposicao_id_api
   AND lower(p.fonte) = lower(d.fonte);

  IF matched <> 3595 THEN
    RAISE EXCEPTION 'B1 URLs: somente % de 3595 linhas correspondem ao banco', matched;
  END IF;
END
$guard$;

-- @write tabela=projetos_lei ref=B1-projetos-20260807 campos=url_inteiro_teor
UPDATE public.projetos_lei p
SET url_inteiro_teor = d.public_url
FROM _pf_project_urls d
JOIN public.candidatos c ON c.slug = d.slug
WHERE p.candidato_id = c.id
  AND p.proposicao_id_api = d.proposicao_id_api
  AND lower(p.fonte) = lower(d.fonte)
  AND p.url_inteiro_teor IS NULL
  AND 'B1-projetos-20260807' = 'B1-projetos-20260807';

COMMIT;
`

writeFileSync(outputPath, sql)
console.log(JSON.stringify({
  source_sha256: sourceHash,
  profiles: profiles.length,
  project_urls: mappings.length,
  output: outputPath,
}))
