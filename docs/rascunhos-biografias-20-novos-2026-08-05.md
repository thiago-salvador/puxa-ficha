# Rascunhos de biografia: os 20 dos 27 novos sem bio (2026-08-05)

**Nada deste arquivo foi gravado no banco.** Escrever biografia a partir de
notícia é decisão editorial do dono do projeto; este arquivo entrega o material
já verificado, frase a frase, para ele aprovar, cortar ou reescrever. Os 7
candidatos de 03/08 que já têm biografia (alessandra-campelo, baba,
ismar-marques, larissa-rosado, luciana-gurgel, luis-cesar-bueno, ze-coca)
vieram de verbete de Wikipédia e ficam fora daqui.

## Decisão editorial e aplicação

Em 05/08/2026, Thiago Salvador aprovou as 20 biografias desta página sem
edições e sem rejeições, em decisão item a item. A migration
`20260805135540_approve_editorial_biographies_20.sql` gravou os textos em
`candidatos.biografia`, acrescentou a referência deste documento a
`fonte_dados` e registrou uma tentativa `encontrado` por candidato em
`coleta_log`, com a execução `editorial:biografias-20260805`.

A leitura de volta confirmou 20 textos idênticos aos aprovados, 20 referências
de fonte e 20 rastros. Continuaram sem biografia apenas coronel-busnello,
jeremias-cosmo, marcus-sodre, patrus-ananias e witer-naves, que já estavam no
seed de 30/07 e não pertenciam ao lote de 27 fichas novas de 03/08.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Método e vocabulário de fontes

Toda frase carrega a fonte entre colchetes. Nenhuma frase sem fonte. Vocabulário:

- **[TSE 2026]** — campo declarado no registro de candidatura de 2026
  (`consulta_cand_2026`), já persistido em `candidatos` (profissão declarada,
  naturalidade, data de nascimento). Vale para os 13 desta lista que já
  protocolaram registro.
- **[TSE ANO]** — linha de `historico_politico` com `proveniencia = 'tse'`,
  casada por CPF (não por nome) contra `consulta_cand` do pleito citado.
- **[TSE votacao_secao 2022/MA]** — apuração manual de 05/08 registrada em
  `historico_politico` com `proveniencia = 'manual'` (caso preta-lu).
- **[Veículo, data, "título"]** — matéria em `noticias_candidato`; a URL de
  cada uma está gravada na tabela (chave: candidato + título). Só se afirma o
  que o título sustenta; corpo de matéria não foi usado.
- **[coleta manual 05/08]** — fato gravado pela sessão de coleta manual da
  madrugada de 05/08, com rastro em `coleta_log`
  (`execucao = 'manual:redes-pendencias-20260805'`).

Regras seguidas: tom factual, sem adjetivação; "candidato(a)" ou
"pré-candidato(a)" conforme a fonte; resultado eleitoral só com registro do
TSE; nenhuma inferência de profissão, formação ou cargo a partir de nome de
urna ou de contexto.

---

## 1. aroldo-felix — Aroldo Felix de Azevedo Junior (UP, Governador, BA)

Rascunho:

1. Aroldo Felix de Azevedo Junior nasceu em 16 de dezembro de 1982, na Paraíba.
   [TSE 2022, registro da candidatura ao governo de SE, casado por CPF]
2. Declarou ao TSE a profissão de professor de ensino superior. [TSE 2022]
3. Em 2022 foi candidato ao governo de Sergipe pela Unidade Popular (UP) e não
   foi eleito. [TSE 2022]
4. Em julho de 2026 a UP o lançou como candidato ao governo da Bahia, em
   convenção. [G1, 25-26/07/2026, "UP lança Aroldo Félix como candidato ao
   governo da Bahia"; Portal Salvador FM, 25/07/2026, "Convenção do UP confirma
   Aroldo Félix como candidato a governador da Bahia"]
5. Em entrevista, defendeu a integração das forças de segurança e propôs
   creches municipais e um programa de reeducação policial. [Classe Política,
   23/07/2026, "Precisamos combater o atacado e não apenas o varejo do crime";
   G1, 23/07/2026, "Aroldo Félix promete implementar creches nos municípios e
   fazer programa de reeducação policial"]

Não foi possível afirmar (sem fonte): cidade de nascimento (o TSE de 2022 só
traz a UF); formação acadêmica e instituição onde leciona; trajetória
profissional; redes sociais (varredura de 05/08 não achou perfil com identidade
confirmável); registro de candidatura de 2026 (até 04/08 não constava no TSE;
prazo 15/08).

## 2. carlos-machado — Carlos Machado (PCB, Governador, SP)

Rascunho:

1. Carlos Machado foi oficializado candidato ao governo de São Paulo pelo PCB
   em convenção realizada no início de agosto de 2026. [CNN Brasil, 03/08/2026,
   "PCB oficializa candidatura de Carlos Machado ao governo de São Paulo"; G1,
   02/08/2026, "PCB oficializa Carlos Machado como candidato ao governo de SP"]

Não foi possível afirmar (sem fonte): data e local de nascimento, idade,
profissão, formação, histórico eleitoral e redes sociais. O nome casa com cinco
pessoas diferentes no TSE (cinco CPFs, vereadores em RS, SP e MG), nenhuma
verificável como o candidato do PCB; todo o histórico foi rejeitado por risco
de homônimo (thread 2, 04/08). Sem registro no TSE 2026 até 04/08.

## 3. catherine-teles — Catherine Morais Teles (UP, Vice-Governador, CE)

Rascunho:

1. Catherine Morais Teles nasceu em 12 de julho de 1992, no Ceará. [TSE 2026]
2. É candidata a vice-governadora do Ceará pela Unidade Popular (UP) na eleição
   de 2026, com registro protocolado no TSE. [TSE 2026, registro de
   candidatura; seed data/candidatos.json, roster de 03/08]

Não foi possível afirmar (sem fonte): cidade de nascimento (registro só traz a
UF); profissão (campo vazio no registro); formação; trajetória; quem encabeça a
chapa; redes sociais (varredura de 05/08 sem achado); nenhuma notícia com o
nome dela no título até 05/08.

## 4. daniela-paiva — Daniela Paiva de Oliveira (AGIR, Vice-Governador, AC)

Rascunho:

1. Daniela Paiva de Oliveira nasceu em 23 de dezembro de 1982, no Acre.
   [TSE 2026]
2. Declarou ao TSE a ocupação de ocupante de cargo em comissão. [TSE 2026]
3. Foi candidata a deputada federal pelo Acre em 2018, pelo PSL, e não foi
   eleita. [TSE 2018]
4. Em 2020 foi candidata a vereadora no Acre pelo MDB e ficou como suplente.
   [TSE 2020]
5. Registrou-se em 2026 como candidata a vice-governadora do Acre pelo AGIR,
   terceiro partido pelo qual disputa uma eleição. [TSE 2026; mudanças
   registradas em `mudancas_partido`: PSL para MDB em 2020, MDB para AGIR em 2026]

Não foi possível afirmar (sem fonte): em que órgão ocupa cargo em comissão;
cidade de nascimento; formação; quem encabeça a chapa (a ficha de dr-luisinho é
da mesma sigla e UF, mas nenhuma fonte no banco liga as duas candidaturas);
redes sociais; nenhuma notícia com o nome dela no título até 05/08.

## 5. dr-luisinho — Francisco das Chagas Conceição da Silva (AGIR, Governador, AC)

Rascunho:

1. Francisco das Chagas Conceição da Silva, com nome de urna "Dr. Luisinho",
   nasceu em 16 de janeiro de 1975, no Acre. [TSE 2026]
2. Declarou ao TSE a profissão de empresário. [TSE 2026]
3. Em 2020 foi candidato a vereador no Amazonas pelo PTB e ficou como suplente.
   [TSE 2020, casado por CPF]
4. Em 2026 o AGIR o lançou como candidato ao governo do Acre. [G1, 03/08/2026,
   "Agir lança Dr. Luisinho como candidato ao governo do Acre"]
5. Foi um dos primeiros a registrar candidatura ao governo do Acre no TSE,
   junto com Alan Rick. [ContilNet, 30/07/2026, "Alan Rick e Dr. Luisinho são
   os primeiros a registrar candidaturas ao governo"]

Não foi possível afirmar (sem fonte): ramo de atividade da empresa; cidade de
nascimento; origem do título "Dr." (nenhuma fonte documenta formação); redes
sociais; por que a candidatura de 2020 foi no Amazonas e a de 2026 no Acre.

## 6. elisson-ferreira — Elisson Ferreira (AGIR, Governador, DF)

Rascunho:

1. Elisson Ferreira foi lançado candidato ao governo do Distrito Federal pelo
   AGIR em julho de 2026, em evento que também apresentou Tiago Társis como
   candidato ao Senado. [G1, 20/07/2026, "Agir lança Elisson Ferreira como
   candidato ao governo do Distrito Federal"; Metrópoles, 20/07/2026, "Agir
   lança Elisson Ferreira candidato ao GDF e Tiago Társis ao Senado"]

Não foi possível afirmar (sem fonte): data e local de nascimento, idade,
profissão, formação, histórico eleitoral (nenhum registro casado no TSE),
redes sociais. Sem registro no TSE 2026 até 04/08.

## 7. gilberto-vasconcelos — Gilberto Vasconcelos da Silva (PSTU, Governador, AM)

Rascunho:

1. Gilberto Vasconcelos da Silva nasceu em 15 de abril de 1967, em Manaus (AM).
   [TSE 2026]
2. Declarou ao TSE a profissão de professor de ensino fundamental. [TSE 2026]
3. Disputou eleições pelo PSTU desde 2010: deputado federal (2010), vereador
   (2012), vice-governador (2014) e prefeito (2020), sempre no Amazonas, sem se
   eleger. [TSE 2010, 2012, 2014 e 2020]
4. Em julho de 2026 o PSTU oficializou sua candidatura ao governo do Amazonas,
   em chapa com Juliana Frota. [G1, 25/07/2026, "PSTU lança Gilberto
   Vasconcelos como candidato ao governo do Amazonas"; A Crítica, 26/07/2026,
   "Gilberto Vasconcelos e Juliana Frota, do PSTU, lançam candidatura ao
   governo"]

Não foi possível afirmar (sem fonte): escola ou rede onde leciona; formação;
em que município foi candidato a prefeito em 2020 (o registro casado traz só a
UF); redes sociais.

## 8. guilherme-fonseca — Guilherme Fonseca (PSTU, Governador, PE)

Rascunho:

1. Guilherme Fonseca foi lançado pré-candidato ao governo de Pernambuco pelo
   PSTU em junho de 2026. [G1, 29/06/2026, "PSTU lança Guilherme Fonseca como
   pré-candidato ao governo de Pernambuco"]
2. Em 25 de julho de 2026 o partido confirmou a candidatura em convenção no
   Recife. [G1, 25/07/2026, "PSTU lança Guilherme Fonseca como candidato ao
   governo de Pernambuco"; Blog da Polo, 25/07/2026, "PSTU lança candidatura de
   Guilherme Fonseca ao Governo de Pernambuco em convenção no Recife"]

Não foi possível afirmar (sem fonte): data e local de nascimento, idade,
profissão, formação, histórico eleitoral (o único registro homônimo no TSE é de
um vereador de Dores do Indaiá/MG pelo UNIÃO, rejeitado por identidade
incompatível), redes sociais. Sem registro no TSE 2026 até 04/08.

## 9. jose-estevao — José Estêvão dos Santos Barbosa (DC, Governador, BA)

Rascunho:

1. José Estêvão dos Santos Barbosa teve a pré-candidatura ao governo da Bahia
   lançada pela Democracia Cristã (DC) em abril de 2026, em evento com apoio de
   Aldo Rebelo. [Muita Informação, 23/04/2026, "Democracia Cristã lança
   pré-candidatura de José Estevão ao governo da Bahia com apoio de Aldo
   Rebelo"]
2. Em julho de 2026 voltou ao comando do partido na Bahia. [A TARDE,
   24/07/2026, "José Estêvão volta ao comando do DC e quer ser candidato ao
   governo"]
3. No início de agosto o partido o lançou candidato ao governo da Bahia.
   [avozdocampo.com, 02/08/2026, "DC lança José Estêvão como candidato ao
   governo da Bahia"]
4. A candidatura é objeto de disputa interna: a imprensa registrou dois
   lançamentos concorrentes pela mesma sigla, o dele e o de Ariel Capistrano.
   [Diário do Estado, 04/08/2026, "Democracia Cristã (DC) lança dois candidatos
   ao Governo da Bahia: José Estevão e Ariel Capistrano disputam o controle do
   partido"]

Nota editorial: a coleta manual apontou que a DC chegou a retirar a
pré-candidatura dele em 10/06. A ficha o mantém como candidato; como comunicar
a disputa interna é decisão do dono do projeto. [coleta manual 05/08;
`execucao = 'manual:redes-pendencias-20260805'`, fonte `busca-redes-manual`,
alvo `jose-estevao`, no campo `detalhe`: "Obs editorial: DC retirou a
pre-candidatura em 10/06, disputa interna no partido"]

Não foi possível afirmar (sem fonte): data e local de nascimento, idade,
profissão, formação, histórico eleitoral, redes sociais. Sem registro no TSE
2026 até 04/08.

## 10. lenilda-luna — Lenilda Luna de Almeida (UP, Governador, AL)

Rascunho:

1. Lenilda Luna de Almeida nasceu em 4 de outubro de 1966, em Cabo de Santo
   Agostinho (PE). [data: TSE, pleitos anteriores; município: Eufemea,
   22/07/2026, gravado na coleta manual de 05/08]
2. Declarou ao TSE a profissão de jornalista e redatora. [TSE, registro de
   pleito anterior]
3. Pela Unidade Popular (UP), foi candidata a prefeita em 2020, a deputada
   federal em 2022 e a prefeita em 2024, em Alagoas, sem se eleger. [TSE 2020,
   2022 e 2024]
4. Em julho de 2026 a UP oficializou sua candidatura ao governo de Alagoas em
   convenção. [G1, 21/07/2026, "Unidade Popular lança Lenilda Luna como
   candidata ao governo de Alagoas"; GazetaWeb, 22/07/2026, "UP oficializa
   candidatura de Lenilda Luna ao governo de Alagoas"]
5. À época da convenção, era a única mulher na disputa pelo governo de Alagoas.
   [Eufemea, 22/07/2026, "Única mulher na disputa, Lenilda Luna tem candidatura
   ao Governo de Alagoas confirmada"]

Não foi possível afirmar (sem fonte): em que município foram as candidaturas a
prefeita de 2020 e 2024 (o registro casado traz só a UF); veículo ou órgão onde
trabalha como jornalista; formação. Redes já gravadas: Instagram `lenildaluna`,
Facebook `lunadealmeida`. [coleta manual 05/08; `execucao =
'manual:redes-pendencias-20260805'`, fonte `busca-redes-manual`, alvo
`lenilda-luna`; os dois perfis constam do material de campanha em
campanhademulher.org] Sem registro no TSE 2026 até 04/08.

## 11. naf-nascimento — Naftaly Pereira do Nascimento (UP, Vice-Governador, RS)

Rascunho:

1. Naftaly Pereira do Nascimento, com nome de urna "Naf Nascimento", nasceu em
   3 de março de 1994, no Piauí. [TSE 2026]
2. Declarou ao TSE a profissão de jornalista e redatora. [TSE 2026]
3. É candidata a vice-governadora do Rio Grande do Sul pela Unidade Popular
   (UP), com registro protocolado no TSE, e foi apresentada pelo partido na
   cobertura da imprensa local. [TSE 2026; Correio do Povo, 06/07/2026,
   "Eleições 2026: saiba quem é Naf Nascimento (UP)"]

Não foi possível afirmar (sem fonte): cidade de nascimento (registro só traz a
UF); veículo onde trabalha; formação; quem encabeça a chapa; redes sociais
(varredura de 05/08 sem achado com identidade confirmável).

## 12. preta-lu — Luciana Costa Correa (PSTU, Vice-Governador, MA)

Rascunho:

1. Luciana Costa Correa, com nome de urna "Preta Lu", nasceu em 5 de julho de
   1981, em São Luís (MA). [TSE 2026]
2. Declarou ao TSE a profissão de artesã. [TSE 2026]
3. Pelo PSTU, foi candidata a vereadora em 2016, a senadora em 2018 e a
   vereadora em 2020, no Maranhão, sem se eleger. [TSE 2016, 2018 e 2020]
4. Em 2022 foi candidata a deputada federal pelo Maranhão e recebeu 1.105 votos
   nominais, sem se eleger. [TSE votacao_secao 2022/MA, apuração manual de
   05/08 com CPF conferido]
5. Em julho de 2026 a convenção do PSTU oficializou sua candidatura a
   vice-governadora na chapa de Saulo Arcangeli. [Blogs O Estado, 31/07/2026,
   "Convenção do PSTU oficializa candidaturas de Saulo Arcangeli e Preta Lu
   para governador e vice"]

Não foi possível afirmar (sem fonte): tipo de artesanato ou local de trabalho;
formação; redes sociais.

## 13. priscila-felizola — Priscila Dias Silva Felizola (REPUBLICANOS, Vice-Governador, SE)

Rascunho:

1. Priscila Dias Silva Felizola nasceu em 18 de janeiro de 1982, em Sergipe.
   [TSE 2026]
2. Declarou ao TSE a profissão de advogada. [TSE 2026]
3. Em abril de 2026 filiou-se ao Republicanos. [Hora News, 02/04/2026,
   "Priscila Felizola se filia ao Republicanos e pode ser a vice de Valmir de
   Francisquinho"]
4. Em junho de 2026 foi confirmada pré-candidata a vice-governadora de Sergipe
   na chapa de Valmir de Francisquinho. [Fan F1, 20/06/2026, "Valmir confirma
   Priscila como pré-candidata a vice-governadora"]

Não foi possível afirmar (sem fonte): cidade de nascimento (registro só traz a
UF); área de atuação na advocacia; formação; histórico eleitoral (nenhum
registro casado no TSE em pleitos anteriores); a saída do agrupamento político
anterior (títulos de abril citam "saída de Priscila do agrupamento" de
Belivaldo, mas o título não sustenta afirmação sobre motivo). Rede já gravada:
Instagram `priscilafelizolaoficial`. [coleta manual 05/08; `execucao =
'manual:redes-pendencias-20260805'`, fonte `busca-redes-manual`, alvo
`priscila-felizola`; a bio do perfil (superintendente do Sebrae/SE) confere com
infonet.com.br]

## 14. prof-enfermeira-kaelly — Kaelly Virginia de Oliveira Saraiva (PSOL, Vice-Governador, MS)

Rascunho:

1. Kaelly Virginia de Oliveira Saraiva, com nome de urna "Prof. Enfermeira
   Kaelly", nasceu em 5 de janeiro de 1970, no Ceará. [TSE 2026]
2. Declarou ao TSE a profissão de professora de ensino superior. [TSE 2026]
3. Em 2020 foi candidata a prefeita pelo PSOL em Mato Grosso do Sul e não foi
   eleita. [TSE 2020]
4. É candidata a vice-governadora de Mato Grosso do Sul pelo PSOL na eleição de
   2026, com registro protocolado no TSE. [TSE 2026]

Não foi possível afirmar (sem fonte): cidade de nascimento (registro só traz a
UF); se atua como enfermeira (o nome de urna sugere, mas nenhuma fonte
documenta registro profissional); instituição onde leciona; em que município
foi candidata em 2020; quem encabeça a chapa; redes sociais (a varredura de
05/08 achou um perfil possível de Facebook, `kaellyvirginia.saraiva`, com
identidade NÃO confirmada; ficou para revisão humana); nenhuma notícia com o
nome dela no título até 05/08.

## 15. prof-meire-reis — Meire Lucia Alves dos Reis (PSOL, Vice-Governador, BA)

Rascunho:

1. Meire Lucia Alves dos Reis nasceu em 9 de novembro de 1970, em Salvador
   (BA). [TSE 2026]
2. Declarou ao TSE a profissão de servidora pública estadual. [TSE 2026]
3. Em 2012 foi candidata a vereadora pelo PSOL na Bahia e ficou como suplente.
   [TSE 2012]
4. É candidata a vice-governadora da Bahia pelo PSOL em 2026; em entrevistas,
   afirmou que a candidatura amplia a presença feminina no poder e comentou o
   crescimento do partido no estado. [TSE 2026; Bahia.Ba, 24/07/2026, "Meire
   Reis diz que candidatura à vice amplia presença feminina no poder"; Bahia
   Notícias, 24/07/2026, "Meire Reis destaca crescimento do PSOL na Bahia e
   avalia candidaturas femininas no país"]

Não foi possível afirmar (sem fonte): órgão onde é servidora; formação; em que
município foi candidata em 2012 (registro traz só a UF); quem encabeça a chapa;
redes sociais.

## 16. ricardo-leite — Fabio Ricardo Leite (REPUBLICANOS, Vice-Governador, AC)

Rascunho:

1. Fabio Ricardo Leite nasceu em 10 de maio de 1967, em Jales (SP). [data e UF:
   TSE 2026; município: A Gazeta do Acre, 26/07/2026, gravado na coleta manual
   de 05/08]
2. Declarou ao TSE a profissão de empresário; a imprensa local o descreve como
   empresário do setor de educação, conhecido como "Rico". [TSE 2026; A Gazeta
   do Acre, 26/07/2026, "De empresário da educação a candidato a vice: quem é
   Ricardo Leite, escolhido por Alan Rick para disputar o governo do Acre"; O
   Alto Acre, 26/07/2026, "Empresário Fábio Ricardo Leite, o Rico, é
   oficializado vice-governador na chapa de Alan Rick"]
3. Em julho de 2026 foi oficializado candidato a vice-governador do Acre na
   chapa de Alan Rick. [O Alto Acre, 26/07/2026, "Empresário Fábio Ricardo
   Leite, o Rico, é oficializado vice-governador na chapa de Alan Rick";
   YacoNews,
   26/07/2026, "Alan Rick anuncia Ricardo Rico Leite como candidato a
   vice-governador do Acre"]
4. Declarou ao TSE bens de R$ 45 milhões. [O Alto Acre, 30/07/2026, "Alan Rick
   declara R$ 5,2 milhões em bens; vice Ricardo Leite informa bens de R$ 45
   milhões ao Tribunal"; ac24horas, 30/07/2026, "Alan Rick e Ricardo Leite
   declaram patrimônio junto ao TSE"]

Não foi possível afirmar (sem fonte): qual empresa ou instituição de ensino;
histórico eleitoral (nenhum registro casado no TSE em pleitos anteriores);
redes sociais.

## 17. robson-raymundo — Robson Raymundo da Silva (PSTU, Governador, DF)

Rascunho:

1. Robson Raymundo da Silva nasceu em 12 de abril de 1970, no Rio de Janeiro
   (RJ). [TSE 2026]
2. Declarou ao TSE a profissão de professor de ensino médio. [TSE 2026]
3. Pelo PSTU, foi candidato ao Senado pelo Distrito Federal em 2010, 2014 e
   2018, e ao governo do Distrito Federal em 2022, sem se eleger. [TSE 2010,
   2014, 2018 e 2022]
4. Em 2026 o PSTU o lançou novamente candidato ao governo do Distrito Federal.
   [G1, 01/08/2026, "PSTU lança Professor Robson como candidato ao governo do
   Distrito Federal"]

Não foi possível afirmar (sem fonte): escola ou rede onde leciona; formação;
redes sociais.

## 18. saulo-arcangeli — Saulo Costa Arcangeli (PSTU, Governador, MA)

Rascunho:

1. Saulo Costa Arcangeli nasceu em 25 de outubro de 1971, em São Luís (MA).
   [TSE 2026]
2. Declarou ao TSE a profissão de professor de ensino superior. [TSE 2026]
3. Disputou sete eleições entre 2010 e 2022, sempre no Maranhão: governo (2010,
   pelo PSOL; 2014), Câmara de Vereadores (2012, 2016, 2020) e Senado (2018,
   2022), as seis últimas pelo PSTU, sem se eleger. [TSE 2010 a 2022; mudança
   PSOL para PSTU em 2012 registrada em `mudancas_partido`]
4. Em julho de 2026 a convenção do PSTU oficializou sua candidatura ao governo
   do Maranhão, em chapa com Preta Lu. [G1, 29/07/2026, "PSTU lança Saulo
   Arcangeli como candidato ao governo do Maranhão"; Blogs O Estado,
   31/07/2026, "Convenção do PSTU oficializa candidaturas de Saulo Arcangeli e
   Preta Lu para governador e vice"]
5. Foi o primeiro candidato ao governo do Maranhão a registrar candidatura no
   TSE em 2026, declarando patrimônio de R$ 656,4 mil. [Maranhão Hoje,
   04/08/2026, "Primeiro a se registrar no TSE, Saulo Arcangeli, do PSTU,
   declara um patrimônio de R$ 656,4 mil"]

Não foi possível afirmar (sem fonte): instituição onde leciona; formação;
redes sociais.

## 19. washington-bandeira — Francisco Washington Bandeira Santos Filho (PT, Vice-Governador, PI)

Rascunho:

1. Francisco Washington Bandeira Santos Filho nasceu em 23 de outubro de 1984,
   no Piauí. [TSE 2026]
2. Declarou ao TSE a profissão de advogado. [TSE 2026]
3. Em julho de 2026 foi homologado candidato a vice-governador do Piauí na
   convenção da base governista, integrando a chapa de Rafael Fonteles.
   [Info Newss, 27/07/2026, "Washington Bandeira é homologado candidato a
   vice-governador"; GP1, 30/07/2026, "'Muito orgulho', diz Washington Bandeira
   sobre integrar chapa de Rafael Fonteles"]
4. Em agosto de 2026 participou do 1º Fórum de Vice-Prefeitos do Piauí, onde
   defendeu o municipalismo. [Portal R10, 04/08/2026, "Washington Bandeira
   destaca fortalecimento do municipalismo no 1º Fórum de Vice-Prefeitos do
   Piauí"]

Não foi possível afirmar (sem fonte): cidade de nascimento (registro só traz a
UF); área de atuação na advocacia; formação; se ocupa ou ocupou cargo público
(nenhum registro casado no TSE em pleitos anteriores; a participação no fórum
de vice-prefeitos não sustenta afirmar que seja vice-prefeito). Rede já
gravada: Instagram `washingtonbandeirafilho`. [coleta manual 05/08; `execucao =
'manual:redes-pendencias-20260805'`, fonte `busca-redes-manual`, alvo
`washington-bandeira`; a bio do perfil (secretário de educação do PI, ex-juiz)
confere com seduc.pi.gov.br]

## 20. yuri-ezequiel — Yuri Ezequiel (UP, Governador, PB)

Rascunho:

1. Yuri Ezequiel foi lançado candidato ao governo da Paraíba pela Unidade
   Popular (UP) em julho de 2026. [G1, 29/07/2026, "Unidade Popular lança Yuri
   Ezequiel como candidato ao governo da Paraíba"]
2. Em entrevistas, defendeu o fortalecimento das empresas públicas e disse se
   colocar contra o que chamou de "ciclo de oligarquias" no estado. [Jornal da
   Paraíba, 17/07/2026, "Yuri Ezequiel (UP) diz que, se eleito governador da
   Paraíba, vai fortalecer as empresas públicas"; Jornal da Paraíba,
   17/07/2026, "Na CBN: Yuri Ezequiel se coloca como opção ao governo da
   Paraíba contra 'ciclo de oligarquias'"]
3. Afirmou que a UP teria uma mulher como pré-candidata a vice na chapa.
   [Portal Correio, 29/07/2026, "Yuri Ezequiel diz que UP terá mulher como
   pré-candidata a vice ao governo do Estado"]

Não foi possível afirmar (sem fonte): nome completo além do que consta no seed,
data e local de nascimento, idade, profissão, formação, histórico eleitoral,
redes sociais. Sem registro no TSE 2026 até 04/08.

---

## Resumo do que falta para os 20 (transversal)

- **7 sem registro no TSE 2026** (aroldo-felix, carlos-machado,
  elisson-ferreira, guilherme-fonseca, jose-estevao, lenilda-luna,
  yuri-ezequiel): dados civis chegam sozinhos quando protocolarem (prazo
  15/08); re-rodar o ingest do TSE depois disso.
- **3 sem nenhuma notícia** (catherine-teles, daniela-paiva,
  prof-enfermeira-kaelly): bio possível hoje é só o registro do TSE.
- **Nenhuma frase sobre formação acadêmica** em nenhum dos 20: não há fonte.
- **Profissão** sempre citada como "declarou ao TSE": é autodeclaração de
  registro, não verificação independente.
