# Handoff para pesquisa: 37 claims da fila de publicacao

Tabela de trabalho extraida de `public.pontos_atencao` em 29/07/2026. Sao as 37
afirmacoes substantivas de candidatos que NAO estao publicados
(`candidatos_publico`), ou seja, invisiveis hoje no site e a um flag de
publicacao de virar publicas.

Ficam fora desta tabela as 33 claims de preenchimento automatico ("Carreira
politica: N mandato(s) registrado(s)" e "Sem historico de mandato eletivo
registrado"), que sao dado derivado e nao pedem pesquisa, e sim decisao de
produto. Contexto completo em `docs/auditoria-fontes-fila-publicacao-2026-07-29.md`.

## Avisos obrigatorios para quem for pesquisar

**1. Nenhuma fonte atual destas claims serve.** Ja foi provado por probe HTTP:
das 34 URLs de dominio jornalistico geradas com `gerado_por = 'ia'` neste banco,
**32 retornam 404**. Nao tente consertar a URL existente: na maioria dos casos
ela nunca existiu. Pesquise do zero.

**2. As colunas `partido` e `cargo disputado` desta tabela tambem sao dado nao
verificado.** A auditoria de 29/07 encontrou pelo menos cinco divergencias entre
o que o seed diz e o que as fontes mostram hoje:

| candidato | o seed diz | o que a pesquisa encontrou |
|---|---|---|
| Marina Silva | PV | esta na Rede; saiu do PV em 2011 |
| Aldo Rebelo | DC | expulso do DC em 22/05/2026, homologado em 25/05/2026, hoje sem partido |
| Michelle Bolsonaro | Presidente | pre-candidata ao Senado pelo DF |
| Simone Tebet | Presidente | pre-candidata ao Senado por SP; deixou o ministerio em 31/03/2026 |
| Ratinho Junior | Presidente | desistiu da pre-candidatura presidencial em 23/03/2026, segue governador do PR |

Trate as duas colunas como pista de identificacao da pessoa, nunca como fato a
ser reproduzido. Se a pesquisa precisar do cargo real, verifique.

**3. A pesquisa nao termina na URL.** Cada claim precisa de quatro respostas
separadas, porque a auditoria encontrou defeito em todas as quatro dimensoes:

- **A afirmacao e verdadeira?** Duas das 37 sao falsas por inteiro (ver claims
  de "ABJ Marketing" e "R$ 282 milhoes").
- **Os numeros e datas conferem?** Erros encontrados incluem 183 mortes que sao
  185, 700 mil mortes anacronicas, 73 leiloes que o proprio governo conta como
  84, saida de partido datada 3 anos antes do fato.
- **O status ainda e vigente?** Decisao judicial pode ter sido revertida,
  arquivada ou prescrita. Um caso vira o sentido: "Condenado em 2a instancia"
  quando a 2a instancia foi quem absolveu.
- **E fato ou enquadramento?** Varias sao juizo editorial em campo factual
  ("recompensada com o ministerio", "questiona-se a construcao de base propria")
  ou elogio classificado como ponto de atencao.

**4. Regra inviolavel de fonte.** Nunca devolver URL que nao foi aberta e cujo
conteudo nao foi lido. Fonte que responde HTTP 200 nao e o mesmo que fonte que
prova: neste banco ja apareceu acordao do STJ de um processo inteiramente
diferente anexado como fonte, e ficha de tramitacao do Senado com o campo de
voto nominal vazio. Preferir fonte primaria oficial (STF, STJ, TSE, TRE, PF,
Senado, Camara, Diario Oficial, API do IBGE/SIDRA) a veiculo jornalistico.

**5. Vedacao eleitoral.** Em julho de 2026, `gov.br`, `agenciabrasil.ebc.com.br`
e vários portais estaduais respondem com aviso de legislacao eleitoral em vez do
conteudo. Isso NAO e fonte morta, e indisponibilidade temporaria. Nao descartar
a fonte por isso; registrar e, se possivel, buscar equivalente.

---

## As 37 claims

UF marcada como `n/d` significa que o campo `estado` esta nulo no banco.

### Gravidade critica (8)

| # | Candidato | Partido | UF | Cargo disputado | Claim | id |
|---|---|---|---|---|---|---|
| 1 | Jair Bolsonaro | PL | n/d | Presidente | Indiciado por tentativa de golpe | `a1b3850e` |
| 2 | Jair Bolsonaro | PL | n/d | Presidente | Indiciado por desvio de joias sauditas | `8fb90ea8` |
| 3 | Jair Bolsonaro | PL | n/d | Presidente | Inelegivel até 2030 | `4ea818c4` |
| 4 | Jair Bolsonaro | PL | n/d | Presidente | Negacionismo na pandemia: 700 mil mortes | `58814104` |
| 5 | Michelle Bolsonaro | PL | n/d | Presidente | Joias sauditas e Pix de Queiroz | `72d7742f` |
| 6 | Pablo Marcal | PRTB | n/d | Presidente | Laudo falso contra Boulos | `6452c61b` |
| 7 | Pablo Marcal | PRTB | n/d | Presidente | Patrimônio declarado de R$ 282 milhões incompativel com histórico | `67f26e0e` |
| 8 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Operação policial com 56 mortes em Baixada Santista | `f2fa7b99` |

### Gravidade alta (10)

| # | Candidato | Partido | UF | Cargo disputado | Claim | id |
|---|---|---|---|---|---|---|
| 9 | Aldo Rebelo | DC | n/d | Presidente | De comunista a aliado de Bolsonaro | `4ccf2e70` |
| 10 | Ciro Gomes | PSDB | n/d | Presidente | Agressao a jornalista durante campanha | `647c916d` |
| 11 | Ciro Gomes | PSDB | n/d | Presidente | Nao apoiou Lula no 2o turno de 2018 e 2022 | `291cf694` |
| 12 | Eduardo Leite | PSD | RS | Presidente | Gestão da crise das enchentes no RS criticada | `0b67b436` |
| 13 | Eduardo Leite | PSD | RS | Presidente | Gestão da reconstrucao pos-enchentes com reconhecimento federal | `0be9f284` |
| 14 | Haddad (Fernando Haddad) | PT | n/d | Presidente | Condenado em 2a instancia por caixa 2 | `c52ef3ae` |
| 15 | Jair Bolsonaro | PL | n/d | Presidente | Sigilo de 100 anos sobre gastos do cartao corporativo | `9faa0f83` |
| 16 | Pablo Marcal | PRTB | n/d | Presidente | Condenação por furto qualificado | `f0922bdd` |
| 17 | Pablo Marcal | PRTB | n/d | Presidente | Envolvimento com piramide financeira (ABJ Marketing) | `e572f945` |
| 18 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Tiro durante comicio em Paraisopolis (2022) | `d470ed69` |

### Gravidade media (14)

| # | Candidato | Partido | UF | Cargo disputado | Claim | id |
|---|---|---|---|---|---|---|
| 19 | Aldo Rebelo | DC | n/d | Presidente | 4 partidos em 8 anos após 30 anos no PCdoB | `67942ea6` |
| 20 | Aldo Rebelo | DC | n/d | Presidente | Ministro do Esporte durante escandalo da Copa 2014 | `9ecc1bc4` |
| 21 | Aldo Rebelo | DC | n/d | Presidente | Presidente da Câmara dos Deputados (2005-2007) | `6ef3e291` |
| 22 | Ciro Gomes | PSDB | n/d | Presidente | 7 partidos em 30 anos de carreira política | `5a9d9a65` |
| 23 | Ciro Gomes | PSDB | n/d | Presidente | Governador do Ceará com investimento em educação | `f25ad23f` |
| 24 | Delegado Eder Mauro | PL | PA | Senador | Condenado pelo STF por difamação após divulgar vídeo adulterado | `84e148c3` |
| 25 | Eduardo Leite | PSD | RS | Presidente | Disputou prévias do PSDB e depois trocou de partido | `4e2f13a0` |
| 26 | Eduardo Leite | PSD | RS | Presidente | Reforma da previdência estadual do RS | `4ac7cf88` |
| 27 | Michelle Bolsonaro | PL | n/d | Presidente | Sem experiência política ou cargo público previo | `7430457c` |
| 28 | Ratinho Junior | PSD | n/d | Presidente | PR com menor taxa de desemprego do Sul em 2023 | `90f21c81` |
| 29 | Simone Tebet | MDB | n/d | Presidente | Apoiou Temer, depois se alinhou a Lula | `30709a00` |
| 30 | Simone Tebet | MDB | n/d | Presidente | Votou pelo Teto de Gastos que agora critica | `b830aeec` |
| 31 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Mudou domicilio eleitoral para SP sem residência previa | `09f569a7` |
| 32 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Recorde de concessões rodoviarias como ministro | `e62c9cb6` |

### Gravidade baixa (5)

| # | Candidato | Partido | UF | Cargo disputado | Claim | id |
|---|---|---|---|---|---|---|
| 33 | Anderson Ferreira | PL | PE | Deputado Federal | TRE-PE aplicou multa de R$ 50 mil por propaganda eleitoral antecipada | `cbe1b208` |
| 34 | Marina Silva | PV | n/d | Presidente | 4 partidos: PT, PV, PSB, Rede | `020f3f6f` |
| 35 | Ratinho Junior | PSD | n/d | Presidente | Herdeiro político: filho do apresentador Ratinho | `35f3d298` |
| 36 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Aprovação acima de 50% como governador de SP | `a35ef613` |
| 37 | Tarcísio de Freitas | REPUBLICANOS | n/d | Presidente | Defensor consistente de privatizações | `b0f094ce` |

## Distribuicao

12 candidatos, 37 claims. Tarcisio de Freitas concentra 6, Pablo Marcal 4, Jair
Bolsonaro 5, Aldo Rebelo 4, Ciro Gomes 4, Eduardo Leite 4, Ratinho Junior 2,
Simone Tebet 2, Michelle Bolsonaro 2, e uma cada para Haddad, Delegado Eder
Mauro, Anderson Ferreira e Marina Silva.

## Formato de retorno sugerido

Um objeto por claim, para permitir aplicacao em lote:

```json
{
  "id": "a1b3850e",
  "afirmacao_confere": "true | false | parcial",
  "observacao_factual": "o que esta errado em numero, data, status ou enquadramento",
  "reescrita_sugerida": "titulo e descricao corrigidos, ou 'remover' com o motivo",
  "url_recomendada": "URL aberta e lida, ou null",
  "trecho_de_evidencia": "citacao curta da pagina que sustenta",
  "tipo_fonte": "primaria_oficial | jornalistica",
  "motivo_se_null": "por que nao existe fonte que sustente"
}
```

Os titulos das claims estao transcritos verbatim do banco, inclusive com os
acentos faltando, para dar match exato na hora de aplicar as correcoes.
