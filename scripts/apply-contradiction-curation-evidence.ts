#!/usr/bin/env tsx

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  montarLinhas,
  type EntradaColeta,
  type ResultadoColeta,
} from "./lib/coleta-log";
import { supabase } from "./lib/supabase";

async function main(): Promise<void> {
  const evidencePath = process.argv
    .find((arg) => arg.startsWith("--evidence="))
    ?.split("=")[1];
  const apply = process.argv.includes("--apply");
  if (!evidencePath) {
    throw new Error(
      "usage: apply-contradiction-curation-evidence.ts --evidence=<path> [--apply]",
    );
  }

  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
    cohort_initial_slugs: string[];
    candidates: Array<{
      id: string;
      slug: string;
      batch: number;
      classification: "sem_achado_no_escopo" | "par_candidato" | "bloqueado";
      identity: { fonte_dados?: unknown[] };
      research: { consulted_urls?: string[] };
      review_item: null | {
        evidence_a?: { url?: string };
        evidence_b?: { url?: string };
      };
    }>;
    summary: { pendentes: number };
    supabase_registration?: Record<string, unknown>;
  };

  if (evidence.summary.pendentes !== 0)
    throw new Error("evidence ainda contém candidatos pendentes");
  if (evidence.candidates.length !== evidence.cohort_initial_slugs.length) {
    throw new Error(
      "cardinalidade do conjunto inicial diverge do arquivo de evidências",
    );
  }

  const { data: publicRows, error: publicError } = await supabase
    .from("candidatos_publico")
    .select("id, slug");
  if (publicError) throw new Error(publicError.message);
  const publicSlugs = new Set(
    (publicRows ?? []).map((row) => row.slug as string),
  );
  const cohortSlugs = new Set(evidence.cohort_initial_slugs);
  const missingPublic = [...cohortSlugs].filter(
    (slug) => !publicSlugs.has(slug),
  );
  if (missingPublic.length > 0) {
    throw new Error(
      `slugs do conjunto inicial deixaram de ser públicos: ${missingPublic.join(",")}`,
    );
  }

  const ids = new Map(
    (publicRows ?? []).map((row) => [row.slug as string, row.id as string]),
  );
  const runId = "contradicoes-curadoria-2026-08-05-initial-194";
  const { data: alreadyRows, error: alreadyError } = await supabase
    .from("coleta_log")
    .select("alvo")
    .eq("fonte", "contradicoes-curadoria")
    .like("detalhe", `%run_id=${runId}%`);
  if (alreadyError) throw new Error(alreadyError.message);
  const already = new Set((alreadyRows ?? []).map((row) => row.alvo as string));

  function sourceUrls(
    candidate: (typeof evidence.candidates)[number],
  ): string[] {
    const identityUrls = (candidate.identity.fonte_dados ?? [])
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.match(/https?:\/\/[^\s)]+/g) ?? []);
    const reviewUrls = [
      candidate.review_item?.evidence_a?.url,
      candidate.review_item?.evidence_b?.url,
    ].filter((item): item is string => Boolean(item));
    return [
      ...new Set([
        ...identityUrls,
        ...reviewUrls,
        ...(candidate.research.consulted_urls ?? []),
      ]),
    ]
      .filter((url) => /^https?:\/\//.test(url))
      .slice(0, 12);
  }

  function resultado(
    candidate: (typeof evidence.candidates)[number],
  ): ResultadoColeta {
    if (candidate.classification === "par_candidato") return "encontrado";
    if (candidate.classification === "bloqueado") return "indeterminado";
    return "sem_achado_no_escopo";
  }

  const entries = evidence.candidates.map((candidate): EntradaColeta => {
    const urls = sourceUrls(candidate);
    if (urls.length === 0)
      throw new Error(`candidato sem URL consultada: ${candidate.slug}`);
    const result = resultado(candidate);
    return {
      fonte: "contradicoes-curadoria",
      alvo: candidate.slug,
      resultado: result,
      volume: result === "encontrado" ? 1 : 0,
      detalhe: [
        `run_id=${runId}`,
        "revisao_em=2026-08-05",
        `lote=${candidate.batch}`,
        `classificacao=${candidate.classification}`,
        "escopo=dados armazenados + busca pública por declarações e ações comparáveis",
        "limite=ausência de achado não prova ausência absoluta de contradições",
        `evidence_file=${evidencePath}`,
      ].join("; "),
      url: urls[0],
    };
  });

  const pending = entries.filter((entry) => !already.has(entry.alvo));
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          total: entries.length,
          already: already.size,
          pending: pending.length,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const batchSize = 20;
  const completedBatches: Array<{
    batch: number;
    inserted: number;
    completed_at: string;
  }> = [];
  for (let index = 0; index < pending.length; index += batchSize) {
    const chunk = pending.slice(index, index + batchSize);
    const lines = montarLinhas(chunk, ids);
    const { error } = await supabase.from("coleta_log").insert(lines);
    if (error)
      throw new Error(
        `lote ${Math.floor(index / batchSize) + 1}: ${error.message}`,
      );
    const completedAt = new Date().toISOString();
    completedBatches.push({
      batch: Math.floor(index / batchSize) + 1,
      inserted: chunk.length,
      completed_at: completedAt,
    });
    evidence.supabase_registration = {
      run_id: runId,
      source: "contradicoes-curadoria",
      completed: false,
      inserted:
        already.size +
        completedBatches.reduce((sum, item) => sum + item.inserted, 0),
      batches: completedBatches,
      updated_at: completedAt,
    };
    const tempPath = join(
      dirname(evidencePath),
      `.${evidencePath.split("/").at(-1)}.tmp`,
    );
    writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
    renameSync(tempPath, evidencePath);
  }

  const completedAt = new Date().toISOString();
  evidence.supabase_registration = {
    run_id: runId,
    source: "contradicoes-curadoria",
    completed: true,
    inserted: entries.length,
    batches: completedBatches,
    completed_at: completedAt,
  };
  const tempPath = join(
    dirname(evidencePath),
    `.${evidencePath.split("/").at(-1)}.tmp`,
  );
  writeFileSync(tempPath, `${JSON.stringify(evidence, null, 2)}\n`);
  renameSync(tempPath, evidencePath);
  console.log(
    JSON.stringify(
      { mode: "apply", inserted: pending.length, total: entries.length },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
