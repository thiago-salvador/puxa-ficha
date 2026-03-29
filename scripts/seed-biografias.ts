/**
 * Populate biografias from Wikipedia summaries.
 * Usage: npx tsx scripts/seed-biografias.ts
 */

import { supabase } from "./lib/supabase"

const biografias: { slug: string; biografia: string }[] = [
  {
    slug: "lula",
    biografia: "Nascido em 1945 em Garanhuns, Pernambuco, Luiz Inacio Lula da Silva e ex-metalurgico e sindicalista que se tornou o 35.o presidente do Brasil (2003-2011). Fundou o Partido dos Trabalhadores em 1980 e liderou greves no ABC Paulista durante a ditadura. Seu governo consolidou programas sociais como Bolsa Familia e Fome Zero. Atualmente exerce seu terceiro mandato presidencial, iniciado em 2023.",
  },
  {
    slug: "flavio-bolsonaro",
    biografia: "Flavio Nantes Bolsonaro nasceu em 1981 em Resende, Rio de Janeiro. Formado em Direito pela Universidade Candido Mendes, foi deputado estadual do Rio de Janeiro de 2003 a 2019. Atualmente e senador pelo Rio de Janeiro, filiado ao Partido Liberal. Em dezembro de 2025, anunciou pre-candidatura a Presidencia da Republica nas eleicoes de 2026.",
  },
  {
    slug: "tarcisio",
    biografia: "Nascido em 1975 no Rio de Janeiro, Tarcisio Gomes de Freitas e engenheiro civil e ex-militar que serviu no Exercito Brasileiro de 1996 a 2008. Foi diretor-geral do DNIT e ministro da Infraestrutura no governo Bolsonaro (2019-2022). Atualmente e governador do Estado de Sao Paulo desde janeiro de 2023, eleito com 55,27% dos votos validos.",
  },
  {
    slug: "romeu-zema",
    biografia: "Romeu Zema Neto nasceu em 1964 em Araxa, Minas Gerais. Administrador formado pela FGV, presidiu o Grupo Zema por 26 anos. Eleito governador de Minas Gerais em 2018 pelo Partido Novo e reeleito em 2022 com 56,18% dos votos. Lancou pre-candidatura presidencial em 2025.",
  },
  {
    slug: "ronaldo-caiado",
    biografia: "Ronaldo Ramos Caiado nasceu em 1949 em Anapolis, Goias. Medico ortopedista filiado ao PSD, foi deputado federal por cinco mandatos e senador federal entre 2015 e 2019. Governador de Goias desde janeiro de 2019, reeleito em 2022. Presidiu a Uniao Democratica Ruralista e e considerado um dos principais nomes da direita brasileira.",
  },
  {
    slug: "ratinho-junior",
    biografia: "Carlos Roberto Massa Junior nasceu em 1981 em Jandaia do Sul, Parana. Empresario e politico filiado ao PSD, foi deputado estadual, deputado federal e secretario de Estado. Eleito governador do Parana em 2018 com 59,99% dos votos e reeleito em 2022 com 69,75%. Governou o estado de 2019 a 2026, com foco em educacao, economia e infraestrutura.",
  },
  {
    slug: "aldo-rebelo",
    biografia: "Nascido em 1956 em Vicosa, Alagoas, Jose Aldo Rebelo Figueiredo e jornalista, escritor e politico. Foi deputado federal por cinco mandatos pelo PCdoB e presidente da Camara dos Deputados (2005-2007). Atuou como ministro da Defesa, Ciencia e Tecnologia, e Esportes nos governos Lula e Dilma. Atualmente filiado a Democracia Crista, anunciou pre-candidatura presidencial para 2026.",
  },
  {
    slug: "ciro-gomes",
    biografia: "Ciro Ferreira Gomes nasceu em 1957 em Pindamonhangaba, Sao Paulo, crescendo em Sobral, Ceara. Advogado pela UFC, foi prefeito de Fortaleza, governador do Ceara (1991-1994) e ministro da Fazenda no governo Itamar Franco. Disputou a presidencia em 1998, 2002, 2018 e 2022.",
  },
  {
    slug: "eduardo-leite",
    biografia: "Eduardo Leite nasceu em 1985 em Pelotas, Rio Grande do Sul. Formado em Direito pela UFPel, foi vereador e prefeito de Pelotas antes de ser eleito governador do Rio Grande do Sul em 2018. Tornou-se o primeiro governador brasileiro abertamente homossexual e o primeiro governador gaucho reeleito (2022). Atualmente governa o RS, filiado ao PSD.",
  },
  {
    slug: "rui-costa-pimenta",
    biografia: "Nascido em 1957 em Sao Paulo, Rui Costa Pimenta e jornalista e politico brasileiro. Fundador do Partido dos Trabalhadores em 1980, integrou a tendencia Causa Operaria ate ser expulso em 1995, quando criou o Partido da Causa Operaria (PCO), do qual e presidente nacional. Candidato presidencial por tres vezes, edita o jornal Causa Operaria.",
  },
  {
    slug: "renan-santos",
    biografia: "Renan Antonio Ferreira dos Santos nasceu em 1984 em Sao Paulo. Ativista politico, empresario e musico, e um dos fundadores e coordenadores do Movimento Brasil Livre (MBL). Atualmente e presidente do Partido Missao, aprovado pelo TSE em novembro de 2025. Destacou-se como estrategista de comunicacao nas manifestacoes pro-impeachment de Dilma Rousseff (2015-2016).",
  },
  {
    slug: "hertz-dias",
    biografia: "Pre-candidato a presidencia pelo PDT nas eleicoes de 2026. Informacoes biograficas detalhadas serao atualizadas quando disponiveis em fontes publicas oficiais.",
  },
  {
    slug: "samara-martins",
    biografia: "Pre-candidata a presidencia pelo Patriota nas eleicoes de 2026. Informacoes biograficas detalhadas serao atualizadas quando disponiveis em fontes publicas oficiais.",
  },
]

async function main() {
  console.log("Populando biografias...\n")
  for (const { slug, biografia } of biografias) {
    const { error } = await supabase
      .from("candidatos")
      .update({ biografia })
      .eq("slug", slug)

    if (error) console.error(`ERRO ${slug}: ${error.message}`)
    else console.log(`OK: ${slug}`)
  }
}

main().catch(console.error)
