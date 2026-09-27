import assert from "node:assert/strict"
import { it } from "node:test"
import { leadPermitidoRegra3 } from "../scripts/lib/checagens-coleta"

/**
 * Holdout rotulado antes de executar a regra nova. Títulos literais de
 * recibos brutos da coleta de 26/09/2026 (fora do repositório).
 * Não é o conjunto de ajuste das decisões editoriais já tomadas.
 *
 * Publicar: o boato, tal como o título o descreve, atribuiu ao candidato uma
 * fala, ação, propriedade, aparição ou vínculo direto com o caso checado.
 * Mesa: só ato de terceiro, parentesco inventado, semelhança de nome, ou
 * atribuição incerta pelo título. Mesa nunca soma no catálogo público.
 */
const holdout: ReadonlyArray<{ slug: string; titulo: string; publicar: boolean }> = [
  { slug: "haddad-gov-sp", titulo: "Haddad não disse que tem planos de ‘taxar tudo’; vídeo foi feito com IA", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Haddad não disse que faltará dinheiro para pagar funcionalismo em junho", publicar: true },
  { slug: "haddad-gov-sp", titulo: "É sátira post dizendo que Haddad vai regulamentar casas noturnas de prostituição", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Haddad não disse que governo Lula criará imposto para sustentar gastos", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Não é verdade que Haddad é dono de uma Ferrari", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Haddad não disse que Maduro é ‘exemplo e inspiração’", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Haddad não disse que vai cortar Bolsa Família de apostadores", publicar: true },
  { slug: "ciro-gomes-gov-ce", titulo: "Ciro Gomes não disse que vai declarar o Ceará uma ‘nação independente’ caso Bolsonaro seja reeleito", publicar: true },
  { slug: "flavio-bolsonaro", titulo: "Flávio Bolsonaro não disse que vai privatizar o SUS se for eleito", publicar: true },
  { slug: "augusto-cury", titulo: "Cury não disse no JN que daria menos de R$ 50 de aumento ao salário mínimo", publicar: true },
  { slug: "sergio-moro-gov-pr", titulo: "Moro não disse que teria que ‘prender deputados’ e ‘fechar Congresso’", publicar: true },
  { slug: "lula", titulo: "Lula não disse que atraso do Nordeste é culpa do Sul do país", publicar: true },
  { slug: "lula", titulo: "Vídeo não mostra Lula sendo hostilizado no interior de SP; imagens são de protesto na Albânia", publicar: true },
  { slug: "eduardo-paes", titulo: "Vídeo não mostra apoio do Comando Vermelho a Eduardo Paes", publicar: true },
  { slug: "romeu-zema", titulo: "É falso que Zema aceitou zerar o ICMS dos combustíveis em MG", publicar: true },
  { slug: "tarcisio-gov-sp", titulo: "Decoração natalina na Praça da Sé não é iniciativa da gestão Tarcísio de Freitas", publicar: true },
  { slug: "lula", titulo: "É falso que filho de Lula comprou a Azul Linhas Aéreas", publicar: false },
  { slug: "haddad-gov-sp", titulo: "É falso que Jayme Monjardim gravou vídeo criticando Fernando Haddad", publicar: false },
  { slug: "haddad-gov-sp", titulo: "É falso que advogado que apoia Haddad defenda agressor de Bolsonaro", publicar: false },
  { slug: "eduardo-paes", titulo: "Ancelmo Gois não é autor de texto que liga máfia carioca a Eduardo Paes", publicar: true },
  { slug: "eduardo-paes", titulo: "Marcelo Freixo não é candidato a vice de Eduardo Paes", publicar: true },
  { slug: "haddad-gov-sp", titulo: "Foto não mostra jornalista Patrícia Campos Mello abraçada a Haddad", publicar: false },
  { slug: "haddad-gov-sp", titulo: "Carro da Receita apreendido com cocaína não é de Fernando Haddad", publicar: true },
  { slug: "flavio-bolsonaro", titulo: "Incêndio de ônibus escolares não tem relação com Flávio Dino", publicar: false },
  { slug: "flavio-bolsonaro", titulo: "Reportagem não disse que Queiroz é pai de Flávio Bolsonaro", publicar: false },
  { slug: "sergio-moro-gov-pr", titulo: "Janaína Paschoal não é autora de áudio com críticas a Moro, defesa de Bolsonaro e teoria da conspiração sobre tráfico humano", publicar: false },
  { slug: "sergio-moro-gov-pr", titulo: "Teori Zavascki não disse que ‘método do juiz Moro é medieval’", publicar: false },
  { slug: "sergio-moro-gov-pr", titulo: "Telegram não disse que hacker manipulou conversas entre Moro e Dallagnol", publicar: false },
  { slug: "lula", titulo: "Supla não falava de Lula ao dizer que não tem problema ‘roubar com amor’", publicar: false },
  { slug: "lula", titulo: "Posts fazem sátira com fato de personagem do filme ‘Truque de Mestre 2’ se chamar Lula", publicar: false },
  { slug: "lula", titulo: "Protesto de Marcelo Falcão não tem relação com governo Lula, vídeo é de 2016", publicar: false },
  { slug: "lula", titulo: "Cristiana Lôbo não é autora de texto sobre ‘populismo socialista’ de Lula", publicar: false },
]

it("regra 3: holdout de 32 títulos reais não publica associação incidental", () => {
  assert.equal(holdout.length, 32)
  const falsosPublicados = holdout.filter((item) => !item.publicar && leadPermitidoRegra3(item.titulo, item.slug))
  const revisao = holdout.filter((item) => !leadPermitidoRegra3(item.titulo, item.slug))
  const publicados = holdout.filter((item) => leadPermitidoRegra3(item.titulo, item.slug))
  assert.deepEqual(falsosPublicados, [], `falsos publicados: ${falsosPublicados.map((item) => item.titulo).join(" | ")}`)
  assert.ok(publicados.length > 0, "a precisão não pode ser obtida por revisão de todos os casos")
  assert.equal(publicados.length + revisao.length, holdout.length)
})
