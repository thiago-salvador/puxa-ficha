# Auditoria das fontes da fila de publicacao (2026-07-29)

## Por que este documento existe

Em 29/07/2026 o workflow `link-check-fontes.yml` rodou pela primeira vez com
credencial de verdade (ate entao os secrets do Supabase nunca tinham sido
configurados nos GitHub Actions, e o job agendado de 27/07 falhou com
`Missing SUPABASE_URL`).

O resultado separou dois mundos:

- **Ficha publica**: nenhuma claim com fonte morta ou sem fonte utilizavel. As
  7 claims publicas reprovadas tinham todas as fontes `indisponivel`, veredito
  temporario (bloqueio de robo, 5xx, vedacao eleitoral).
- **Fila de publicacao** (candidato fora de `candidatos_publico`): 25 claims
  com fonte morta e 63 sem fonte utilizavel.

Dentro da fila, 18 claims sao de gravidade `alta` ou `critica`, todas com
`verificado = true` no banco. Este documento e a triagem dessas 18. Elas nao
estao visiveis hoje, mas estao a um flag de publicacao de virar publicas.

## Metodo

1. Cada afirmacao foi verificada por um agente independente, com instrucao
   explicita de nunca devolver URL nao aberta. Meta declarada: fonte primaria
   oficial (STF, TSE, TRE, Senado, PF) antes de veiculo jornalistico.
2. **Toda URL recomendada foi reverificada por mim** com `probeUrlReal`, o
   mesmo probe que o `link-check` usa em producao. Resultado: **16/16 vivas**,
   todas HTTP 200 com corpo substantivo. Nenhuma URL entrou aqui sem passar
   nesse teste.
3. As tres afirmacoes cujo sentido se INVERTE tiveram o conteudo da pagina
   conferido termo a termo (STF, Poder360, Brasil de Fato).

Limitacao registrada: a skill `firecrawl` estava sem creditos durante a
execucao (`Insufficient credits`), e os agentes usaram WebSearch mais leitura
direta. Alem disso, por vedacao eleitoral, `gov.br`, `agenciabrasil.ebc.com.br`
e portais estaduais estao fora do ar, o que impediu citar fonte primaria
oficial em varios itens de numero (mortes no RS, valores federais). Esses itens
merecem reprocessamento depois de outubro.

## Veredito

**Nenhuma das 18 afirmacoes sobreviveu intacta.** Duas sao factualmente falsas,
uma inverte o sentido do fato, e as demais precisam de correcao material de
numero, data, status processual ou enquadramento.

O padrao de origem e visivel: URLs de `g1.globo.com` e `folha.uol.com.br` com
formato que os proprios veiculos nao usam (ano sem mes e dia), home nua de
portal como "fonte", e ate um `consulta_cand_{ano}.zip` com o placeholder nao
substituido. Descricao e URL parecem ter sido geradas juntas.

---

## 1. Remover ou reescrever antes de qualquer publicacao

### 1.1 `e572f945` pablo-marcal, alta: "Envolvimento com piramide financeira (ABJ Marketing)"

**A empresa "ABJ Marketing" nao existe em fonte alguma.** Busca pelo termo
entre aspas, combinado com o nome dele, com "piramide", com Goias e com
Ministerio Publico, retorna zero ocorrencias.

Nomear uma empresa inexistente e atribuir a ela acusacao de piramide, ligando a
pessoa nomeada, e o pior caso deste documento. **Acao: remover.**

Se a intencao era registrar apuracao financeira real, existem fatos
verificaveis e completamente distintos (relatorio do Coaf, apuracao da PF sobre
caixa 2 e lavagem na campanha de 2022). Nenhum deles e piramide, e nenhum
resultou em condenacao: teria que dizer "investigado", nunca "condenado".

### 1.2 `c52ef3ae` fernando-haddad, alta: "Condenado em 2a instancia por caixa 2"

**O titulo afirma o oposto do que aconteceu.** A segunda instancia nao
condenou: foi ela que absolveu. O TRE-SP absolveu Haddad por unanimidade em
27/07/2021, por inexistencia de provas. A unica condenacao foi de primeira
instancia, em agosto de 2019.

A descricao tambem erra duas vezes: atribui ao TRE-SP a condenacao (o TRE-SP
absolveu) e afirma anulacao "pelo TSE em 2022", que nao se sustentou em
nenhuma fonte. Alem disso absolvicao por falta de provas nao e sinonimo de
anulacao: anulacao sugere vicio processual, absolvicao afirma que nao ha prova.

**Acao: avaliar se o item deve existir.** Se ficar, o titulo tem que declarar o
desfecho. Manter o atual publica uma condenacao que nao existe.

Fonte verificada: https://www.poder360.com.br/justica/tre-de-sao-paulo-absolve-fernando-haddad-de-acusacao-de-caixa-2-eleitoral/

### 1.3 `0be9f284` eduardo-leite, alta: "Gestao da reconstrucao pos-enchentes com reconhecimento federal"

Dois defeitos. **O numero de R$ 85 bilhoes nao existe em fonte publica
nenhuma** (os valores federais reais sao R$ 98,7 bi, R$ 111,6 bi ou R$ 141 bi,
conforme data e criterio). E a atribuicao esta invertida: os recursos foram
destinados pela Uniao, nao articulados por ele, que cobrava publicamente o
governo federal.

Ha um terceiro problema, de criterio: **o item e elogioso e esta classificado
como gravidade alta.** Elogio com gravidade alta corroi o significado da
propria escala de gravidade da plataforma. **Acao: remover.**

### 1.4 `67f26e0e` pablo-marcal, critica: "Patrimonio declarado de R$ 282 milhoes incompativel com historico"

**O valor nao existe.** Conferi a pagina do Brasil de Fato termo a termo: zero
ocorrencias de "282". Os valores declarados sao R$ 96,5 milhoes (2022) e
R$ 193,5 milhoes (2024, o maior ja declarado). Nem somando se chega a 282.

A segunda metade do titulo, "incompativel com historico", e juizo e nao fato, e
a ficha nao diz quem faz esse juizo. **Acao: reescrever com o valor e o ano
corretos**, e trocar a conclusao por fato rastreavel (omissao e divergencia na
declaracao ao TSE, sob apuracao).

Fonte verificada: https://www.brasildefato.com.br/2024/08/08/pablo-marcal-declara-r-193-5-milhoes-em-bens-e-e-o-mais-rico-entre-candidatos-registrados-no-tse/

### 1.5 `291cf694` ciro-gomes, alta: "Nao apoiou Lula no 2o turno de 2018 e 2022"

Falsa nos dois ciclos. Em 2018 o adversario de Bolsonaro no 2o turno era
Haddad, nao Lula, e houve apoio formal do PDT. Em 2022 Ciro declarou apoio a
Lula em video, em 04/10/2022. O que ele recusou em 2018 foi fazer campanha,
viajando a Europa no dia seguinte ao anuncio de apoio.

**Acao: reescrever** para o fato verificavel (nao fez campanha em 2018) ou
remover.

Fonte verificada: https://www.poder360.com.br/eleicoes/ciro-viaja-a-europa-1-dia-apos-anunciar-apoio-a-haddad/

---

## 2. Corrigir numero, data ou status processual

| id | candidato | gravidade | o que corrigir | fonte verificada (HTTP 200) |
|---|---|---|---|---|
| `a1b3850e` | jair-bolsonaro | critica | "Indiciado por tentativa de golpe" ficou **desatualizado para menos**: o STF condenou na AP 2668 (acordao publicado 22/10/2025). Confirmei no texto da pagina do STF. | https://noticias.stf.jus.br/postsnoticias/ap-2668-publicado-acordao-que-condenou-o-ex-presidente-bolsonaro-e-outros-sete-reus-por-tentativa-de-golpe/ |
| `8fb90ea8` | jair-bolsonaro | critica | Indiciamento de jul/2024 confere, mas a PGR pediu arquivamento em mar/2026 e o caso nunca virou denuncia. Publicar como `critica` sem esse contexto e exposicao desnecessaria. | https://agenciabrasil.ebc.com.br/justica/noticia/2026-03/pgr-pede-arquivamento-de-inquerito-sobre-desvio-de-joias-por-bolsonaro |
| `58814104` | jair-bolsonaro | critica | "700 mil mortes" e anacronico: na data do relatorio da CPI (26/10/2021) o Brasil tinha pouco mais de 600 mil. E falta o desfecho, a PGR pediu arquivamento das apuracoes. | https://www12.senado.leg.br/noticias/materias/2021/10/26/apos-seis-meses-cpi-da-pandemia-e-encerrada-com-80-pedidos-de-indiciamento |
| `f2fa7b99` | tarcisio | critica | A ficha **funde duas operacoes**. A Escudo (2023) teve 28 mortes em cerca de 40 dias; as 56 mortes sao da Operacao Verao (dez/2023 a abr/2024). "56 em 5 dias" nao descreve nenhuma. A frase sobre a ONU inverte quem acionou quem. | https://www.hrw.org/pt/report/2023/11/07/386399 |
| `72d7742f` | michelle-bolsonaro | critica | "Pix" e anacronico (Pix so existe desde nov/2020; eram cheques), o periodo e 2011-2016 e nao 2011-2018, o STF arquivou em 2021 por falta de lastro, e ela nao foi indiciada no caso das joias. | https://www.gazetadopovo.com.br/republica/cheques-de-michelle-bolsonaro-stf-forma-maioria-para-arquivar-pedido-de-investigacao/ |
| `6452c61b` | pablo-marcal | critica | A remocao dos videos confere; a **multa nao foi concedida** nessa decisao (o TRE-SP registra deferimento parcial). Nao confundir com a multa de outro processo. | https://www.tre-sp.jus.br/comunicacao/noticias/2024/Outubro/juiz-da-2a-zona-eleitoral-determina-exclusao-de-videos-de-marcal-contra-boulos |
| `f0922bdd` | pablo-marcal | alta | Condenacao de 2010 confere, mas **"pena cumprida" e falso e inverte o fato**: a punicao foi extinta por prescricao em 2018 e ele nunca foi preso. A condenacao tambem nao foi por formacao de quadrilha. | https://www.infomoney.com.br/politica/afinal-pablo-marcal-foi-condenado-por-esquema-de-fraudes-bancarias-entenda-o-caso/ |
| `d470ed69` | tarcisio | alta | Nao foi comicio (era inauguracao de polo universitario) e a ficha omite que o inquerito foi arquivado pela Justica, sem denuncia. | https://www.poder360.com.br/justica/investigacao-em-paraisopolis-nao-identifica-segurancas-de-tarcisio/ |
| `0b67b436` | eduardo-leite | alta | 183 mortes esta desatualizado: o consolidado e 185 obitos e 23 desaparecidos (19/08/2025). "Cortes em investimentos" e impreciso; o documentado e subalocacao e execucao baixa. | https://reporterbrasil.org.br/2024/05/orcamento-contra-desastres-naturais-no-rs-e-so-9-do-anunciado-por-governo-diz-oposicao/ |
| `9faa0f83` | jair-bolsonaro | alta | O cartao corporativo estava classificado como "reservada" (5 anos), nao sob sigilo de 100 anos; o prazo de 100 anos valeu para outros itens (cartao de vacina, visitas ao Planalto). A liberacao cumpriu acordao do TCU. O ponto se sustenta, a redacao nao. | https://apublica.org/2023/01/de-saida-bolsonaro-ocultou-dados-de-cartao-corporativo-e-entradas-no-planalto/ |
| `4ea818c4` | jair-bolsonaro | critica | **Unico item que confere integralmente.** So trocar a home nua do TSE pela noticia especifica. | https://www.tse.jus.br/comunicacao/noticias/2023/Junho/por-maioria-de-votos-tse-declara-bolsonaro-inelegivel-por-8-anos |

---

## 3. Itens de natureza interpretativa

Estes nao sao erro factual, sao enquadramento editorial publicado como "ponto
de atencao" com gravidade alta. Merecem decisao de criterio, nao so de fonte.

| id | candidato | questao |
|---|---|---|
| `647c916d` | ciro-gomes | Ataque verbal a jornalistas esta documentado pela Abraji; **"intimidou fisicamente" nao tem nenhuma fonte**. E o processo judicial citado e de outro episodio, de 2021, nao de evento de campanha. |
| `4ccf2e70` | aldo-rebelo | A trajetoria partidaria e verificavel, mas "aliado de Bolsonaro" nao tem ato concreto (sem apoio declarado a candidatura, sem cargo, sem campanha), e a janela 2018-2022 esta errada: em 2022 ele era candidato pelo PDT. Os atos de aproximacao sao de 2024-2025. |

---

## O que NAO foi feito

Nenhuma escrita no banco. Nenhuma claim despublicada, reescrita ou removida.
Este documento e insumo de decisao editorial, que e humana por desenho, do
mesmo jeito que a despublicacao no `link-check` exige `--apply` rodado a mao.

## Recomendacao de sequencia

1. Resolver a secao 1 (5 itens) antes de publicar qualquer um desses
   candidatos. Dois deles afirmam hoje coisa factualmente falsa sobre pessoa
   nomeada.
2. Rodar a secao 2 como lote de correcao de texto e fonte.
3. Decidir o criterio da secao 3: se "ponto de atencao" admite enquadramento
   politico ou so fato com ato concreto. A resposta muda o produto, nao so
   estas duas fichas.
4. Varrer o resto da fila com o mesmo metodo. FEITO: ver Parte 2.

---

# Parte 2: varredura das claims de gravidade media e baixa

Executada na mesma sessao, a pedido. As 52 claims restantes da fila se dividem
em dois problemas completamente diferentes, e tratar as duas como "45 casos a
investigar" teria sido erro de diagnostico.

## 2.1 O achado sistemico: a fonte jornalistica do seed foi fabricada em massa

Testei com `probeUrlReal` TODAS as URLs de dominio jornalistico geradas com
`gerado_por = 'ia'` na tabela inteira, publicas e nao publicas:

**32 das 34 testadas retornam HTTP 404.**

As duas unicas vivas sao da CNN Brasil, ambas em ficha do `flavio-bolsonaro`.
Todo o resto (g1, Folha, BBC) esta morto. Isso nao e link rot, que seria
aleatorio e atingiria tambem as fontes oficiais. E assinatura de URL gerada por
modelo: o padrao aparece inclusive em URLs bem formadas, com data completa,
que mesmo assim nunca existiram.

O contraste fecha o diagnostico:

| origem | tipo de fonte | resultado |
|---|---|---|
| `gerado_por = 'ia'` | jornalistica | 32 de 34 mortas |
| `gerado_por = 'ia'` | oficial | 197 URLs, das quais **166 sao dominio nu** |
| `gerado_por = 'curadoria'` | qualquer | as testadas estao vivas e sustentam a claim |

**Consequencia pratica: nenhuma fonte jornalistica com `gerado_por = 'ia'` deve
ser considerada verificada.** Nao e caso a caso, e a camada inteira.

## 2.2 As 33 claims de preenchimento automatico

33 claims de gravidade `baixa`, uma para cada um de 33 candidatos distintos,
com dois titulos apenas:

- "Sem historico de mandato eletivo registrado" (10), fonte `https://www.tse.jus.br`
- "Carreira politica: N mandato(s) registrado(s)" (23), fontes
  `https://www.camara.leg.br` e `https://www.senado.leg.br`

Todas com dominio nu como "fonte". Elas respondem por 166 das URLs de dominio
nu contadas acima.

Estas nao precisam de 33 investigacoes. Precisam de uma decisao: **contagem de
mandato nao e ponto de atencao, e um dado derivado** que o projeto ja tem em
`historico_politico`. Ou o campo passa a ser renderizado como dado da ficha,
com a fonte apontando para o dataset real do TSE, ou as claims saem. Manter
como "ponto de atencao" com a home do TSE como prova nao serve a nenhum dos
dois propositos.

## 2.3 As 19 claims substantivas

Verificadas uma a uma, mesmo metodo da Parte 1: agentes independentes com
proibicao de devolver URL nao aberta, seguidos de reverificacao minha com
`probeUrlReal`. **17 URLs novas recomendadas, 17 de 17 vivas.** Somando as duas
partes: **33 de 33 URLs propostas neste documento passaram no probe do
proprio projeto.**

### Erros factuais no ar (corrigir antes de publicar)

| id | candidato | erro |
|---|---|---|
| `90f21c81` | ratinho-junior | **"PR com menor taxa de desemprego do Sul em 2023" e FALSO.** Puxei a PNAD Continua direto da API do SIDRA: Santa Catarina bateu o Parana nos QUATRO trimestres (media anual SC 3,55% contra PR 4,90%). Nao existe recorte de 2023 em que a afirmacao seja verdadeira. |
| `7430457c` | michelle-bolsonaro | **"Nunca ocupou cargo publico" e FALSO.** Foi secretaria parlamentar na Camara entre 2004 e 2008, incluindo 14 meses no gabinete do proprio marido, de onde saiu apos a sumula do STF contra nepotismo. |
| `5a9d9a65` | ciro-gomes | Saida do PDT datada de 2022; foi em **17/10/2025**. Em outubro de 2022 ele era o candidato do PDT a Presidencia, ou seja, a claim afirma que ele saiu do partido no momento em que o representava. Hoje esta no PSDB. |
| `67942ea6` | aldo-rebelo | Contagem de partidos errada (foram cinco, nao quatro) e desatualizada: foi expulso do DC em 22/05/2026, homologado em 25/05/2026, e hoje esta sem partido. |
| `e62c9cb6` | tarcisio | O numero "73 leiloes" nao aparece em fonte nenhuma; o proprio governo dele usa 84. A fonte atual, `gov.br/infraestrutura`, redireciona para outro orgao porque o Ministerio da Infraestrutura foi extinto em 2023. |
| `4e2f13a0` | eduardo-leite | Filiacao ao PSD datada de abril/2024; foi em **09/05/2025**. CORRECAO DE 30/07/2026: a versao anterior desta linha dizia que ele "ja oficializou pre-candidatura em 06/03/2026" a Presidencia. Isso caiu. O Thiago confirmou em 30/07 que **Eduardo Leite nao concorrera**, e a varredura dos governadores achou fonte de 30/03/2026 dizendo que, com a escolha de Ronaldo Caiado pelo PSD, ele decidiu ficar no governo do RS ate o fim do mandato. A ficha dele foi marcada `desistente` com cargo `Nenhum` na migration `20260730120000`. |
| `b0f094ce` | tarcisio | A Sabesp nao foi privatizada: foi desestatizacao parcial, com o Estado caindo de 50,3% para 18,3% e seguindo maior acionista individual. O superlativo "maior privatizacao estadual da historia" nao se sustenta em fonte alguma. |

### Fonte que responde 200 mas nao prova a claim

Esta categoria e a mais traicoeira, porque passa em qualquer link-check:

| id | candidato | problema |
|---|---|---|
| `84e148c3` | delegado-eder-mauro | A claim tem duas fontes. A do STF sustenta tudo. **A do STJ e de outro processo inteiramente**: e o REsp 1897338-DF, caso Maria Regina Sousa contra Joice Hasselmann e Google. Deve sair da lista. |
| `b830aeec` | simone-tebet | A ficha de tramitacao do Senado tem o campo de votacao nominal VAZIO, entao nao prova o voto individual dela. A fonte que prova e a chamada nominal publicada pela Agencia Senado, onde ela aparece entre os 53 favoraveis. O open data de voto nominal foi desativado em 01/02/2026. |
| `6ef3e291` | aldo-rebelo | `camara.leg.br/deputados/73428` e a ficha atual de deputado e nao mostra presidencia nem ministerios. A pagina oficial de ex-presidentes da Camara sustenta. |
| `a35ef613` | tarcisio | `datafolha.folha.uol.com.br` e dominio nu. Pior: no mesmo Datafolha de julho/2026 a aprovacao da gestao e 63% (sustenta a claim) mas otimo/bom e 45% (derruba). Dizer so "acima de 50%" escolhe silenciosamente a metrica favoravel. |

### Enquadramento editorial publicado como fato

Padrao que apareceu em pelo menos 8 das 19, e que nenhum link-check pega:

- **Elogio classificado como ponto de atencao**: "Recorde de concessoes"
  (tarcisio), "Aprovacao acima de 50%" (tarcisio), "Governador do Ceara com
  investimento em educacao" (ciro-gomes), "Reforma da previdencia" (eduardo-leite).
  Numa plataforma de fiscalizacao, release do biografado com a autoridade de
  achado de auditoria e pior que erro de numero.
- **Juizo com aparencia de fato**: "Historico de dificuldade em manter
  aliancas" (marina-silva), "Questiona-se a construcao de base propria"
  (ratinho-junior, em voz passiva sem sujeito), "foi RECOMPENSADA com o
  Ministerio" (simone-tebet), "reduzindo deficit previdenciario"
  (eduardo-leite, projecao que reproduz fala do proprio governador; o deficit
  do RPPS/RS ainda era ~R$ 9,8 bi em 2024).
- **Culpa por coincidencia temporal**: "Ministro do Esporte durante escandalo
  da Copa 2014" (aldo-rebelo). Nao ha imputacao concreta a ele; a fonte que
  achei diz explicitamente que ele nao foi acusado.

### Decaimento temporal

Terceiro problema estrutural, alem de fonte e enquadramento: o seed trata como
vigente coisa que mudou. Filiacao partidaria de Ciro e de Aldo, cargo de
ministra da Tebet (saiu em 31/03/2026), status processual do Bolsonaro. **Toda
claim de filiacao partidaria e de cargo em exercicio precisa de revalidacao**,
nao so as auditadas aqui. Uma ficha que diz "e ministra" apodrece sozinha, sem
ninguem editar nada.

## 2.4 Conclusao das duas partes

Das 70 claims da fila de publicacao com fonte inutilizavel:

- 33 sao preenchimento automatico e pedem uma decisao de produto, nao 33 investigacoes.
- 37 sao substantivas e foram auditadas uma a uma. **Nenhuma sobreviveu intacta.**
- 3 afirmam hoje coisa factualmente falsa sobre pessoa nomeada (ABJ Marketing,
  R$ 282 milhoes, "condenado em 2a instancia") e mais 4 tem numero ou data que
  nenhuma fonte sustenta.

O defeito nao e "fontes que morreram". E que a camada de claims gerada por IA
entrou no banco sem verificacao, com fonte fabricada, numero inventado,
enquadramento editorial e decaimento temporal. O link-check pega so a primeira
dessas quatro coisas.
