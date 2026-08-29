import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCurrentOfficialCandidacies,
  sanitizeCandidateList,
  sanitizeVices,
} from "../scripts/lib/data-freshness/divulgacand-current";

test("sanitiza a lista sem propagar CPF, título, email ou processo", () => {
  const rows = sanitizeCandidateList(
    [
      {
        id: 140002554108,
        nomeUrna: "WELL MACEDO",
        descricaoSituacao: "Aguardando julgamento",
        dataUltimaAtualizacao: "2026-08-20 18:31",
        partido: { sigla: "PSTU" },
        cpf: "nao-deve-sair",
        tituloEleitor: "nao-deve-sair",
        emails: ["nao-deve-sair"],
        numeroProcesso: "nao-deve-sair",
      },
    ],
    "Governador",
    "PA",
  );

  assert.deepEqual(rows, [
    {
      sq_candidato: "140002554108",
      profile_slug: null,
      office: "Governador",
      uf: "PA",
      name: "WELL MACEDO",
      status: "Aguardando julgamento",
      party: "PSTU",
      checked_at: "2026-08-20 18:31",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /cpf|titulo|email|processo/i);
});

test("normaliza vices e preserva o código que decide vigência", () => {
  assert.deepEqual(
    sanitizeVices({
      vices: [
        { sq_CANDIDATO: 140002538632, nm_URNA: "WELL MACEDO", situacaoVice: 3 },
        { sq_CANDIDATO: 140002554109, nm_URNA: "SEU ALEX", situacaoVice: 1 },
      ],
    }),
    [
      { sq_candidato: "140002538632", name: "WELL MACEDO", situacao_vice: 3 },
      { sq_candidato: "140002554109", name: "SEU ALEX", situacao_vice: 1 },
    ],
  );
});

test("coleta falha fechada se qualquer UF vier vazia", async () => {
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    const empty = url.includes("/TO/");
    return new Response(
      JSON.stringify(
        empty
          ? []
          : [
              {
                id: url.includes("/BR/") ? "280002500001" : `sq-${url}`,
                nomeUrna: "CANDIDATO",
                descricaoSituacao: "Deferido",
                partido: { sigla: "AAA" },
              },
            ],
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  await assert.rejects(
    collectCurrentOfficialCandidacies(fakeFetch),
    /zero candidatos a Governador em TO/,
  );
});
