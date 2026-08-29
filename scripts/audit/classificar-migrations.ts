/**
 * Classifica `supabase/migrations/` em schema e curadoria, e prevê o replay.
 *
 * Issue #136. Lê o disco e delega o veredito a
 * `lib/migrations-classificacao.ts`, que é puro e testado. Este arquivo só faz
 * IO e formatação.
 *
 * Uso:
 *   npx tsx scripts/audit/classificar-migrations.ts            # resumo
 *   npx tsx scripts/audit/classificar-migrations.ts --json     # manifesto
 *   npx tsx scripts/audit/classificar-migrations.ts --quebras  # só as que quebram
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import {
  classificarMigration,
  resumir,
  type ClassificacaoMigration,
} from "./lib/migrations-classificacao";
import { RETIDAS_PADRAO } from "./lib/ledger-guard";

export const DIR_MIGRATIONS = "supabase/migrations";
export const CAMINHO_MANIFESTO_SCHEMA =
  "scripts/audit/schema-replay-substituicoes.json";

export interface OrigemSchemaSeparada {
  arquivo: string;
  sha256: string;
  objetos: string[];
}

export interface ManifestoSchemaReplay {
  _comentario?: string;
  schema_dump_sha256: string;
  substituto: string;
  origens: OrigemSchemaSeparada[];
}

export interface ClassificacaoComReplaySchema extends ClassificacaoMigration {
  /** Entra no replay do schema atual, sem curadoria aplicada nem migrations retidas. */
  replaySchema: boolean;
}

export function listarArquivosDeMigration(
  dir: string = DIR_MIGRATIONS,
): string[] {
  return readdirSync(dir)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();
}

export function classificarTodas(
  dir: string = DIR_MIGRATIONS,
): ClassificacaoMigration[] {
  return listarArquivosDeMigration(dir).map((arquivo) =>
    classificarMigration(arquivo, readFileSync(join(dir, arquivo), "utf8")),
  );
}

export function carregarManifestoSchema(
  caminho: string = CAMINHO_MANIFESTO_SCHEMA,
): ManifestoSchemaReplay {
  return JSON.parse(readFileSync(caminho, "utf8")) as ManifestoSchemaReplay;
}

function sha256(conteudo: string): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Valida a separação antes de permitir que uma mista saia do replay de schema.
 * A origem continua em disco, com hash congelado, e o substituto precisa ser
 * DDL puro. Assim a allowlist não esconde reescrita de histórico nem aponta
 * para um arquivo vazio ou de curadoria.
 */
export function validarManifestoSchema(
  todas: readonly ClassificacaoMigration[],
  dir: string = DIR_MIGRATIONS,
  manifesto: ManifestoSchemaReplay = carregarManifestoSchema(),
): void {
  const porArquivo = new Map(todas.map((m) => [m.arquivo, m]));
  if (!/^[a-f0-9]{64}$/.test(manifesto.schema_dump_sha256)) {
    throw new Error("manifesto sem SHA-256 canônico do pg_dump de schema");
  }
  const substituto = porArquivo.get(manifesto.substituto);
  if (!substituto)
    throw new Error(`substituto de schema ausente: ${manifesto.substituto}`);
  if (
    substituto.classe !== "schema" ||
    substituto.mista ||
    !substituto.temDdlPersistente
  ) {
    throw new Error(`substituto precisa ser DDL puro: ${manifesto.substituto}`);
  }

  const sqlSubstituto = readFileSync(join(dir, manifesto.substituto), "utf8");
  const vistas = new Set<string>();
  for (const origem of manifesto.origens) {
    if (vistas.has(origem.arquivo))
      throw new Error(`origem duplicada: ${origem.arquivo}`);
    vistas.add(origem.arquivo);
    const classificada = porArquivo.get(origem.arquivo);
    if (!classificada)
      throw new Error(`origem separada ausente: ${origem.arquivo}`);
    if (!classificada.mista)
      throw new Error(`origem deixou de ser mista: ${origem.arquivo}`);

    const sqlOrigem = readFileSync(join(dir, origem.arquivo), "utf8");
    if (sha256(sqlOrigem) !== origem.sha256) {
      throw new Error(`origem aplicada foi reescrita: ${origem.arquivo}`);
    }
    if (origem.objetos.length === 0)
      throw new Error(`origem sem objetos declarados: ${origem.arquivo}`);
    for (const objeto of origem.objetos) {
      const marcador = objeto.split(/[.:]/).at(-1);
      if (!marcador || !sqlSubstituto.includes(marcador)) {
        throw new Error(
          `objeto ${objeto} ausente do substituto ${manifesto.substituto}`,
        );
      }
    }
  }
}

export function classificarTodasComReplaySchema(
  dir: string = DIR_MIGRATIONS,
  manifesto: ManifestoSchemaReplay = carregarManifestoSchema(),
): ClassificacaoComReplaySchema[] {
  const todas = classificarTodas(dir);
  validarManifestoSchema(todas, dir, manifesto);
  const origensSeparadas = new Set(manifesto.origens.map((o) => o.arquivo));
  return todas.map((m) => ({
    ...m,
    replaySchema:
      m.temDdlPersistente &&
      !origensSeparadas.has(m.arquivo) &&
      !RETIDAS_PADRAO.some((versao) => m.arquivo.startsWith(`${versao}_`)),
  }));
}

function main() {
  const args = process.argv.slice(2);
  const todas = classificarTodasComReplaySchema();

  if (args.includes("--json")) {
    console.log(
      JSON.stringify({ resumo: resumir(todas), migrations: todas }, null, 2),
    );
    return;
  }

  if (args.includes("--quebras")) {
    for (const m of todas.filter((c) => c.replay === "quebra_sem_guard")) {
      console.log(m.arquivo);
    }
    return;
  }

  const r = resumir(todas);
  console.log(
    [
      `total                       : ${r.total}`,
      `  schema                    : ${r.schema}`,
      `  curadoria                 : ${r.curadoria}`,
      `  mistas (DDL + conteudo)   : ${r.mistas}`,
      ``,
      // "Previsao estatica" de proposito: ela e conservadora e marca quebra
      // mais cedo do que o replay real quebra (52a contra 179a), porque
      // pos-condicao que passa em banco vazio e indistinguivel por texto de uma
      // que estoura. O numero comparavel a realidade sai do replay
      // (scripts/audit/replay-migrations.sh), nunca daqui.
      `previsao ESTATICA de replay (conservadora; o numero real e do replay-migrations.sh)`,
      `  previstas replicaveis     : ${r.replicaveis}`,
      `  previstas como quebra     : ${r.quebram}`,
      `  primeira quebra prevista  : ${r.primeiraQuebra ?? "nenhuma"}`,
      `  posicao dela na ordem     : ${r.limpasAteAPrimeiraQuebra}`,
    ].join("\n"),
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
