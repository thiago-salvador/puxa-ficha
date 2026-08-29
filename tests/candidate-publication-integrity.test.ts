import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  analyzeProfileAdmission,
  classifyOfficialCandidacy,
  reconcilePublicRoster,
  selectCurrentVice,
  type OfficialCandidacy,
} from "../src/lib/candidate-publication-integrity";

const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/divulgacand-candidate-integrity-2026.json",
    "utf8",
  ),
) as {
  candidacies: OfficialCandidacy[];
  well_vices: Array<{
    sq_candidato: string;
    name: string;
    situacao_vice: number;
  }>;
};

test("classifica situação oficial sem transformar recurso em inaptidão", () => {
  const [cleber, well, estevao] = fixture.candidacies;

  assert.equal(classifyOfficialCandidacy(cleber), "terminal");
  assert.equal(classifyOfficialCandidacy(well), "active");
  assert.equal(classifyOfficialCandidacy(estevao), "active");
  assert.equal(
    classifyOfficialCandidacy({ ...well, status: "Situação nova do TSE" }),
    "review_required",
  );
});

test("reconcilia o conjunto público inteiro e não mascara stale com cardinalidade igual", () => {
  const report = reconcilePublicRoster(fixture.candidacies, [
    { slug: "cleber-rabelo", office: "Governador", uf: "PA" },
    { slug: "well-macedo", office: "Governador", uf: "PA" },
  ]);

  assert.deepEqual(
    report.stale_public.map((row) => row.slug),
    ["cleber-rabelo"],
  );
  assert.deepEqual(
    report.missing_public.map((row) => row.profile_slug),
    ["jose-estevao"],
  );
  assert.equal(report.active_official_registrations, 2);
  assert.equal(report.active_official_profiles, 2);
  assert.equal(report.published_profiles, 2);
  assert.equal(report.status, "review_required");
});

test("detecta duas inscrições oficiais ativas ligadas ao mesmo perfil", () => {
  const report = reconcilePublicRoster(
    [
      {
        sq_candidato: "110002553937",
        profile_slug: "laudicerio-aguiar",
        office: "Governador",
        uf: "MT",
        name: "SARGENTO LAUDICÉRIO (LAU)",
        status: "Aguardando julgamento",
      },
      {
        sq_candidato: "110002554073",
        profile_slug: "laudicerio-aguiar",
        office: "Governador",
        uf: "MT",
        name: "SARGENTO LAUDICÉRIO",
        status: "Aguardando julgamento",
      },
    ],
    [{ slug: "laudicerio-aguiar", office: "Governador", uf: "MT" }],
  );

  assert.equal(report.active_official_registrations, 2);
  assert.equal(report.active_official_profiles, 1);
  assert.deepEqual(Object.keys(report.duplicate_active_mappings), [
    "laudicerio-aguiar",
  ]);
  assert.equal(report.status, "review_required");
});

test("mesmo slug em cargo ou UF divergente não aprova a reconciliação", () => {
  const official = [
    {
      ...fixture.candidacies[1],
      profile_slug: "well-macedo",
    },
  ];
  const report = reconcilePublicRoster(official, [
    { slug: "well-macedo", office: "Presidente", uf: null },
  ]);
  assert.equal(report.status, "review_required");
  assert.equal(report.identity_mismatches.length, 1);
  assert.equal(report.missing_public.length, 1);
  assert.equal(report.stale_public.length, 1);
});

test("seleciona a vice vigente e rejeita titular como própria vice", () => {
  assert.deepEqual(selectCurrentVice("140002554108", fixture.well_vices), {
    status: "resolved",
    vice: fixture.well_vices[1],
  });

  assert.deepEqual(
    selectCurrentVice("140002554108", [
      { sq_candidato: "140002554108", name: "WELL MACEDO", situacao_vice: 1 },
    ]),
    { status: "review_required", reason: "titular_como_propria_vice" },
  );
});

test("perfil novo vazio falha no gate de admissão com campos e procedência explícitos", () => {
  const report = analyzeProfileAdmission({
    slug: "well-macedo",
    partido_sigla: null,
    situacao_candidatura: null,
    foto_url: null,
    biografia: null,
    naturalidade: null,
    data_nascimento: "1980-03-23",
    formacao: null,
    profissao_declarada: null,
    genero: null,
    estado_civil: null,
    cor_raca: null,
    verificacao_campos: { candidate_registration: "2026-08-27" },
  });

  assert.equal(report.ready, false);
  assert.deepEqual(report.missing_fields, [
    "partido_sigla",
    "situacao_candidatura",
    "foto_url",
    "biografia",
    "naturalidade",
    "formacao",
    "profissao_declarada",
    "genero",
    "estado_civil",
    "cor_raca",
  ]);
  assert.deepEqual(report.missing_verification, ["candidate_complement"]);
});

test("perfil com valor ou vazio confirmado em todas as frentes pode ser admitido", () => {
  const report = analyzeProfileAdmission({
    slug: "perfil-pronto",
    partido_sigla: "PSTU",
    situacao_candidatura: "aguardando julgamento",
    foto_url: "https://divulgacandcontas.tse.jus.br/foto.jpg",
    biografia: "Biografia factual sustentada pelas fontes declaradas.",
    naturalidade: "Belém (PA)",
    data_nascimento: "1980-03-23",
    formacao: "Superior incompleto",
    profissao_declarada: "Comunicólogo",
    genero: "Feminino",
    estado_civil: "Solteiro(a)",
    cor_raca: "Preta",
    verificacao_campos: {
      candidate_registration: {
        estado: "publicado",
        verificado_em: "2026-08-28",
      },
      candidate_complement: {
        estado: "publicado",
        verificado_em: "2026-08-28",
      },
    },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(report.missing_fields, []);
  assert.deepEqual(report.missing_verification, []);
});
