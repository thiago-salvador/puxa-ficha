export interface MethodologySource {
  id: string
  name: string
  url: string
  description: string
  dataTypes: string[]
  sourceKind: "base_oficial" | "fonte_publica_complementar"
  updateFrequency: "diária" | "semanal" | "mensal" | "por ciclo eleitoral" | "sob demanda"
  curationType: "automático" | "curadoria" | "misto"
  curationNote?: string
}

/**
 * Registry centralizado de todas as fontes de dados usadas no Puxa Ficha.
 * Mantido em sincronia com `scripts/ingest-all.ts` e `scripts/lib/ingest-*.ts`.
 *
 * REGRA DE HONESTIDADE (auditoria de integridade 2026-07-24, achados A0.3 e F4).
 * Esta lista e uma promessa publica em /metodologia. Duas coisas mudaram na
 * etapa 2C:
 *
 * 1. Fonte so entra aqui quando ja existe dado publicado e superficie que o
 *    renderiza. A entrada "Cadastro de Sancoes (CGU)" foi removida em
 *    2026-07-25 por falhar nas duas condicoes, e REINSERIDA em 2026-08-05
 *    quando as duas passaram a valer: `SancoesSection` renderiza o bloco na
 *    aba Justica (inclusive a prova negativa "nada encontrado", com data,
 *    lida de `coleta_log_ultima`) e a varredura corrigida de 2026-08-04
 *    registrou o desfecho da consulta para cada candidato com CPF valido.
 *    Historico do vaivem em `docs/fontes-pendentes.md`.
 *
 * 2. `updateFrequency` descreve cadencia REAL e verificavel, nao intencao.
 *    "diaria" so vale com cron de producao (`vercel.json`) ou `schedule:` em
 *    `.github/workflows/`. Estado em 2026-07-29:
 *      - Google News: diaria, via cron `0 8 * * *` de `/api/news/refresh` em
 *        `vercel.json`.
 *      - Camara e Senado: semanal, via `schedule: 0 6 * * 3` em
 *        `.github/workflows/ingest.yml` (adicionado 2026-07-29). Se o cron
 *        sair ou mudar de cadencia, este rotulo muda no MESMO commit.
 *      - Todo o resto roda por lote manual, que e exatamente o que
 *        "sob demanda" descreve.
 */
export const METHODOLOGY_SOURCES: readonly MethodologySource[] = [
  // --- Fontes federais (candidatos) ---
  {
    id: "tse",
    name: "TSE (Tribunal Superior Eleitoral)",
    url: "https://dadosabertos.tse.jus.br",
    description:
      "Fonte primária de candidaturas, patrimônio declarado, financiamento de campanha e situação da candidatura.",
    dataTypes: [
      "Candidaturas e dados cadastrais",
      "Patrimônio declarado",
      "Financiamento de campanha (receitas e despesas)",
      "Situação da candidatura e CPF",
      "Certidões criminais",
    ],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "automático",
    curationNote: "CSVs do TSE baixados e processados em lote, quando há atualização na base de origem.",
  },
  {
    id: "tse-historico",
    name: "TSE: Histórico Eleitoral",
    url: "https://dadosabertos.tse.jus.br",
    description:
      "Consulta de candidaturas passadas, de 1994 a 2024, para reconstruir o histórico político de cada candidato.",
    dataTypes: [
      "Candidaturas anteriores (cargo, partido, UF, ano)",
      "Mudanças de partido ao longo dos ciclos",
    ],
    sourceKind: "base_oficial",
    updateFrequency: "por ciclo eleitoral",
    curationType: "misto",
    curationNote:
      "Ingest automático dos CSVs; curadoria editorial para resolução de duplicatas e cargo canônico.",
  },
  {
    id: "camara",
    name: "Câmara dos Deputados",
    url: "https://dadosabertos.camara.leg.br",
    description:
      "API REST da Câmara com votações nominais, gastos parlamentares e projetos de lei.",
    dataTypes: [
      "Votações nominais em plenário",
      "Gastos parlamentares (CEAP)",
      "Projetos de lei (autorias)",
      "Frentes parlamentares",
    ],
    sourceKind: "base_oficial",
    // Automação real: schedule semanal (0 6 * * 3) em .github/workflows/ingest.yml.
    updateFrequency: "semanal",
    curationType: "automático",
  },
  {
    id: "senado",
    name: "Senado Federal",
    url: "https://legis.senado.leg.br/dadosabertos",
    description:
      "API do Senado com votações, autorias de projetos e dados de mandatos.",
    dataTypes: [
      "Votações nominais",
      "Autorias de proposições",
      "Mandatos e comissões",
    ],
    sourceKind: "base_oficial",
    // Automação real: schedule semanal (0 6 * * 3) em .github/workflows/ingest.yml.
    updateFrequency: "semanal",
    curationType: "automático",
  },
  {
    id: "transparencia",
    name: "Portal da Transparência (CGU)",
    url: "https://portaldatransparencia.gov.br",
    description:
      "Dados de gastos públicos, incluindo totais mensais do CPGF por órgão, contratos e viagens de servidores e parlamentares.",
    dataTypes: [
      "Gastos e contratos públicos",
      "Totais mensais do CPGF por órgão",
      "Viagens a serviço",
    ],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "tcu",
    name: "TCU (Tribunal de Contas da União)",
    url: "https://portal.tcu.gov.br",
    description:
      "Processos e julgamentos do TCU que envolvam candidatos.",
    dataTypes: ["Processos e condenações no TCU"],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  // REINSERIDO em 2026-08-05: "Cadastro de Sanções (CGU)". Tinha sido removido
  // na etapa 2C (auditoria 2026-07-24, achado A0.3) porque a tabela estava
  // vazia e nenhum componente renderizava o dado. As duas condições mudaram:
  //   - A superfície existe: SancoesSection renderiza o bloco na aba Justiça,
  //     inclusive o resultado negativo verificado ("nada encontrado", com data),
  //     lido de coleta_log_ultima (fonte transparencia-sanctions).
  //   - O dado publicado hoje é a prova negativa: a varredura corrigida de
  //     2026-08-04 (PR #85, parâmetros codigoSancionado/cpfSancionado +
  //     conferência de identidade do retorno) consultou CEIS, CNEP e CEAF e
  //     registrou vazio_confirmado para os candidatos com CPF válido. CEPIM
  //     saiu do pipeline na mesma PR: só filtra CNPJ, nunca casaria com CPF.
  // Histórico completo do vaivém em docs/fontes-pendentes.md.
  {
    id: "transparencia-sancoes",
    name: "Cadastro de Sanções (CGU)",
    url: "https://portaldatransparencia.gov.br/sancoes",
    description:
      "Cadastros de sanções administrativas do Portal da Transparência, consultados por CPF com conferência de identidade em cada registro retornado. A ficha também mostra quando a consulta foi feita e nada foi encontrado, com a data da verificação.",
    dataTypes: [
      "Sanções administrativas (CEIS, CNEP, CEAF)",
      "Verificação com resultado vazio (registro da consulta e data)",
    ],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch em
    // .github/workflows/ingest.yml (verificado 2026-08-05). Se ganhar cron,
    // este rótulo muda no MESMO commit.
    updateFrequency: "sob demanda",
    curationType: "automático",
    curationNote:
      "Consulta automática por CPF validado; candidato sem CPF válido não é consultado e a ficha marca os cadastros como não verificados.",
  },
  {
    id: "filiacao",
    name: "TSE: Filiação Partidária",
    url: "https://dadosabertos.tse.jus.br",
    description:
      "Registro de filiação partidária dos candidatos para timeline de mudanças de partido.",
    dataTypes: ["Filiação e desfiliação partidária"],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "ceaps-senado",
    name: "CEAPS (Senado)",
    url: "https://www12.senado.leg.br/transparencia",
    description:
      "Cota para Exercício da Atividade Parlamentar dos Senadores.",
    dataTypes: ["Gastos parlamentares de senadores"],
    sourceKind: "base_oficial",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  // Jarbas (Serenata de Amor) saiu daqui em 2026-08-05. Mesma regra do achado
  // A0.3: fonte só aparece nesta página quando há dado publicado E superfície
  // que o renderiza. O endpoint responde HTTP 522 (Cloudflare de pé, origem
  // fora), `pontos_atencao` tem ZERO linha vinda dele e `coleta_log` tem zero
  // tentativa registrada. Anunciá-la era prometer ao leitor uma verificação que
  // nunca aconteceu. O ingest continua no repositório, agora gravando `erro` em
  // vez de silêncio, e o caminho de volta está em docs/fontes-pendentes.md.
  //
  // CEAPS continua na lista logo acima, de propósito: ao contrário de Jarbas,
  // ela tem 102 linhas em `gastos_parlamentares` (65 em fichas publicáveis) que
  // o site mostra. A rota de atualização caiu, o dado publicado não.

  // --- Enriquecimento (biografias, fotos, redes) ---
  {
    id: "wikipedia",
    name: "Wikipedia / Wikidata",
    url: "https://pt.wikipedia.org",
    description:
      "Biografias, fotos, dados demográficos, redes sociais e histórico político complementar.",
    dataTypes: [
      "Biografia e foto",
      "Dados demográficos",
      "Redes sociais",
      "Histórico político complementar",
    ],
    sourceKind: "fonte_publica_complementar",
    // Sem automação: lote manual via workflow_dispatch (verificado 2026-07-25).
    updateFrequency: "sob demanda",
    curationType: "misto",
    curationNote:
      "Ingest automático de Wikidata; curadoria editorial para resolução de ambiguidades e dados faltantes.",
  },
  {
    id: "google-news",
    name: "Google News",
    url: "https://news.google.com",
    description:
      "Notícias recentes sobre cada candidato, agregadas diariamente. Só entra no perfil a matéria cujo título cita o candidato.",
    dataTypes: ["Notícias recentes"],
    sourceKind: "fonte_publica_complementar",
    // Única fonte com automação real: cron "0 8 * * *" de /api/news/refresh
    // em vercel.json (verificado 2026-07-25).
    updateFrequency: "diária",
    curationType: "automático",
  },

  // --- Indicadores estaduais ---
  {
    id: "ibge",
    name: "IBGE · SIDRA",
    url: "https://servicodados.ibge.gov.br",
    description:
      "População estimada e PIB total por UF (séries dos agregados SIDRA).",
    dataTypes: ["População estimada", "PIB por UF"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "ipea",
    name: "Ipeadata",
    url: "https://www.ipeadata.gov.br",
    description:
      "Taxa de desemprego, taxa de pobreza e índice de Gini por UF (PNAD Contínua).",
    dataTypes: ["Desemprego", "Pobreza", "Gini"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "atlas-violencia",
    name: "Atlas da Violência (Ipea)",
    url: "https://www.ipea.gov.br/atlasviolencia/",
    description:
      "Homicídios e indicadores de violência letal por 100 mil habitantes.",
    dataTypes: ["Taxa de homicídios por UF"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "ideb",
    name: "INEP · IDEB",
    url: "https://www.gov.br/inep/pt-br",
    description:
      "IDEB do ensino médio por UF, quando disponível na base.",
    dataTypes: ["IDEB do ensino médio"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "capag",
    name: "Tesouro Transparente · CAPAG",
    url: "https://www.tesourotransparente.gov.br",
    description:
      "Notas e indicadores da CAPAG (capacidade de pagamento dos estados).",
    dataTypes: ["Nota CAPAG por UF"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
  {
    id: "siconfi",
    name: "Tesouro · Siconfi",
    url: "https://apidatalake.tesouro.gov.br/docs/siconfi/",
    description:
      "Receita, despesa, resultado primário e relação pessoal/RCL por UF (RREO/RGF).",
    dataTypes: ["Receitas e despesas estaduais", "Resultado primário", "Pessoal/RCL"],
    sourceKind: "base_oficial",
    updateFrequency: "sob demanda",
    curationType: "automático",
  },
] as const
