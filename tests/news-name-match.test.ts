/**
 * Guard de relevancia de noticia (auditoria de integridade 2026-07-24, etapa 1C).
 *
 * Todos os titulos usados aqui sao LINHAS REAIS de `noticias_candidato` no
 * Supabase wskpzsobvqwhnbsdsmok, extraidas por SELECT em 2026-07-25 (primeira
 * leva) e em 2026-08-05 (leva do furo de sobrenome compartilhado, depois de o
 * cron das 06:32 ter reinserido sozinho o que fora apagado a mao horas antes),
 * junto com o `nome_urna`/`nome_completo` do candidato a que estavam
 * associadas.
 *
 * Ha UM titulo construido no arquivo, marcado como tal no proprio teste.
 * Fora ele, nenhum titulo foi inventado.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  newsTitleMentionsCandidate,
  splitNewsByCandidateMention,
} from "@/lib/news/name-match"

const MARIA = { nome_urna: "Maria da Consolação", nome_completo: "Maria da Consolação Soares" }
const JHC = { nome_urna: "JHC", nome_completo: "João Henrique Caldas" }
const LULA = { nome_urna: "Lula", nome_completo: "Luiz Inácio Lula da Silva" }
const CINTIA = { nome_urna: "Cintia Dias", nome_completo: "Cintia Aparecida Dias" }
const CAIUBI = { nome_urna: "Caiubi Kuhn", nome_completo: "Caiubi Emanuel Souza Kuhn" }
const MAINHA = { nome_urna: "Mainha", nome_completo: "Jose de Andrade Maia Filho" }

// Casos do furo de cabeca de chapa / homonimo de sobrenome, 05/08/2026.
// Titulos extraidos por SELECT em `noticias_candidato` em 05/08/2026, depois do
// cron das 06:32 ter reinserido sozinho o que fora apagado a mao horas antes.
const ISMAR = { nome_urna: "Ismar Marques", nome_completo: "Ismar Aguiar Marques" }
const GUSTAVO = { nome_urna: "Gustavo Henrique", nome_completo: "Gustavo Henrique Leite Feijó" }
const VERA = { nome_urna: "Vera Lúcia", nome_completo: "Vera Lúcia Pereira da Silva Salgado" }

describe("descarta cobertura do pleito que nao cita o candidato", () => {
  it("titulo generico de disputa estadual nao vale como noticia do candidato", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Em meio à indecisão da esquerda, Psol lança pré-candidata ao governo de MG - Estado de Minas",
        MARIA,
      ),
      false,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Quem são os possíveis candidatos a governador do Maranhão nas eleições 2026? - JOTA Info",
        { nome_urna: "Enilton Rodrigues", nome_completo: "Enilton Rodrigues" },
      ),
      false,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Daniel Vilela lidera cenários de 1º e 2º turnos em Goiás, diz Genial/Quaest - SBT News",
        CINTIA,
      ),
      false,
    )
  })

  it("materia sobre outra pessoa da mesma disputa nao passa", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Rafael Fonteles, do PT, tem ampla maioria para governador do Piauí, aponta pesquisa - Revista Fórum",
        MAINHA,
      ),
      false,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Eleições 2026: O plano do PT para conter alta de Flávio Bolsonaro nas pesquisas - BBC",
        LULA,
      ),
      false,
    )
  })
})

describe("mantem cobertura que cita o candidato", () => {
  it("nome de urna completo no titulo", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "PSOL propõe unidade ao PT e a candidatura de Cintia Dias a governadora - O Popular",
        CINTIA,
      ),
      true,
    )
  })

  it("acento diferente entre banco e titulo nao quebra o match", () => {
    // Banco: "Cintia Dias". Titulo publicado: "Cíntia Dias".
    assert.equal(
      newsTitleMentionsCandidate(
        "Plano de governo: Cíntia Dias (Psol) - G1",
        CINTIA,
      ),
      true,
    )
  })

  it("primeiro nome distintivo sozinho conta", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Caiubi mira eleitorado de centro-esquerda e vê espaço deixado por Natasha - HiperNotícias",
        CAIUBI,
      ),
      true,
    )
  })

  it("apelido curto de uma palavra conta", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Mainha confirma pré-candidatura ao Governo do Piauí - gazeta hora1",
        MAINHA,
      ),
      true,
    )
  })

  it("nome completo casa quando o titulo nao usa o nome de urna", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Acompanhe a trajetória de Maria da Consolação Rocha candidato(a) em 2026 - tmc.com.br",
        MARIA,
      ),
      true,
    )
  })
})

describe("sigla curta (caso JHC)", () => {
  it("casa a sigla como palavra inteira, sem o artefato do corte de 4 letras", () => {
    // A regra da auditoria (tokens com 4+ letras) marcava 117 de 117 noticias
    // do JHC como sem match, o que era artefato do corte e nao ruido real.
    assert.equal(
      newsTitleMentionsCandidate("JHC anuncia pré-candidatura ao governo de Alagoas", JHC),
      true,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Nordeste: eleição para governador coloca em risco hegemonia petista - congressoemfoco.com.br",
        JHC,
      ),
      false,
    )
  })

  it("nao casa a sigla dentro de outra palavra", () => {
    assert.equal(newsTitleMentionsCandidate("Prefeitura de JHCidade abre concurso", JHC), false)
  })
})

describe("cabeca de chapa nao entra na ficha do vice", () => {
  // O vice `ismar-marques` recebeu materia sobre ELIZEU AGUIAR porque "aguiar"
  // e token distintivo do nome completo dele. Removidas a mao em 05/08 e
  // reinseridas pelo cron das 06:32 do mesmo dia.
  it("materia so sobre o cabeca de chapa nao casa com o vice", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Novo lança Elizeu Aguiar como candidato ao governo do Piauí - G1",
        ISMAR,
      ),
      false,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Elizeu Aguiar: conheça o perfil, limite de gastos de R$ 7,1 milhões, histórico, vice e bens do candidato ao governo do Piauí em 2026 - Elesbão News",
        ISMAR,
      ),
      false,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        'NOVO oficializa chapa ao Governo do Piauí e rejeita papel de coadjuvante na oposição: "Vamos disputar o segundo turno", diz Elizeu Aguiar - portalopiniaoenoticia.com.br',
        ISMAR,
      ),
      false,
    )
  })

  it("materia que cita o vice pelo nome continua entrando, mesmo com o cabeca de chapa no titulo", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Novo oficializa Elizeu Aguiar como candidato ao Governo do Piauí e confirma Ismar Marques na vice - 180graus",
        ISMAR,
      ),
      true,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Ismar Marques será candidato a vice-governador de Elizeu Aguiar pelo Partido Novo - Portal Lupa1",
        ISMAR,
      ),
      true,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Ismar Marques assumirá vice-presidência da Assembleia - cidadeverde.com",
        ISMAR,
      ),
      true,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Deputado Ismar Marques (PSB) é escolhido líder do governo na Alepi - CidadeVerde.com",
        ISMAR,
      ),
      true,
    )
  })
})

describe("sobrenome compartilhado com outra figura da mesma disputa", () => {
  // Estes sao os casos que o guarda pega de graca, medidos contra as 20.047
  // linhas de `noticias_candidato` em 05/08/2026: 30 linhas viram contexto do
  // pleito, e estas sao as mais claras.
  it("sobrenome do nome completo sozinho nao entrega materia de outra pessoa", () => {
    // "Neto" de "Joao Inacio Ribeiro Roma Neto" pegava toda materia de ACM Neto.
    assert.equal(
      newsTitleMentionsCandidate(
        "ACM Neto lidera corrida para governador da Bahia em 2026 - Gazeta do Povo",
        { nome_urna: "Joao Roma", nome_completo: "João Inácio Ribeiro Roma Neto" },
      ),
      false,
    )
    // "Gomes" de "Wagner Sousa Gomes" pegava toda materia de Ciro Gomes.
    assert.equal(
      newsTitleMentionsCandidate(
        "Ciro Gomes articula chapa da direita para disputa com PT pelo governo do Ceará - InfoMoney",
        { nome_urna: "Capitão Wagner", nome_completo: "Wagner Sousa Gomes" },
      ),
      false,
    )
    // "Rosado" de "Larissa Daniela Escossia Rosado" pegava materia de Sandra Rosado.
    assert.equal(
      newsTitleMentionsCandidate(
        "Racha no PSB leva grupo de Sandra Rosado para ninho tucano no RN - Saiba Mais",
        { nome_urna: "Larissa", nome_completo: "Larissa Daniela Escossia Rosado" },
      ),
      false,
    )
    // "Dias" de "Tulio Cesar Dias Lopes" casava com "200 dias das eleicoes".
    assert.equal(
      newsTitleMentionsCandidate(
        "A 200 dias das eleições, veja as primeiras pré-candidaturas a Governo e Senado por Minas Gerais - Tribuna de Minas",
        { nome_urna: "Tulio Lopes", nome_completo: "Tulio Cesar Dias Lopes" },
      ),
      false,
    )
  })

  it("dois pedacos do nome completo no mesmo titulo continuam casando", () => {
    // TITULO CONSTRUIDO, unico do arquivo: o corpus real nao tem exemplo de
    // candidato tratado por dois sobrenomes que nao estao no nome de urna. Ele
    // existe para fixar que o guarda pede DOIS tokens, e nao proibe o nome
    // civil: quem for chamado por ele continua entrando.
    assert.equal(
      newsTitleMentionsCandidate("Inácio Ribeiro assume vaga no Senado pela Bahia", {
        nome_urna: "Joao Roma",
        nome_completo: "João Inácio Ribeiro Roma Neto",
      }),
      true,
    )
  })

  it("LIMITACOES CONHECIDAS, registradas para nao serem supostas como cobertas", () => {
    // (a) Primeiro nome comum do NOME DE URNA continua valendo sozinho. O
    // guarda so restringe token exclusivo do nome completo, entao homonimo de
    // primeiro nome ainda passa. Tentar resolver com caixa alta reprovava 147
    // linhas legitimas (ver docblock do modulo).
    assert.equal(
      newsTitleMentionsCandidate("Bolsonaro indica Gustavo Canuto para o Ministério", GUSTAVO),
      true,
    )
    // (b) Homonimo que repete o nome de urna INTEIRO casa na regra 1, antes de
    // qualquer guarda. Nenhuma informacao no titulo separa as duas pessoas.
    assert.equal(
      newsTitleMentionsCandidate("Desembargadora Vera Lúcia Ferreira Copetti nega recurso", VERA),
      true,
    )
  })

  it("o candidato certo continua casando", () => {
    assert.equal(
      newsTitleMentionsCandidate(
        "Eleições 2026 PI: Gustavo Henrique é lançado como candidato ao governo pelo partido Avante - Portal Clube News",
        GUSTAVO,
      ),
      true,
    )
    assert.equal(
      newsTitleMentionsCandidate(
        "Vera Lúcia é registrada pelo PSTU como candidata a governadora de SP e declara não ter bens - Estadão",
        VERA,
      ),
      true,
    )
  })
})

describe("splitNewsByCandidateMention", () => {
  it("separa os dois grupos preservando a ordem", () => {
    const { mencionam, contextoDoPleito } = splitNewsByCandidateMention(
      [
        { titulo: "Mainha confirma pré-candidatura ao Governo do Piauí - gazeta hora1" },
        { titulo: "AtlasIntel: Fonteles vence todos os cenários de 2º turno no PI - CNN Brasil" },
        { titulo: "Mainha avalia desempenho na pesquisa do Instituto GP1" },
      ],
      MAINHA,
    )

    assert.equal(mencionam.length, 2)
    assert.equal(contextoDoPleito.length, 1)
    assert.match(contextoDoPleito[0].titulo, /AtlasIntel/)
  })

  it("titulo vazio nunca conta como mencao", () => {
    assert.equal(newsTitleMentionsCandidate("", LULA), false)
    assert.equal(newsTitleMentionsCandidate(null, LULA), false)
  })
})
