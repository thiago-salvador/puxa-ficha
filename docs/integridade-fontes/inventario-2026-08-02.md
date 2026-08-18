# Backlog de integridade de fontes: inventário nominal

Gerado 2026-08-02. Fonte dos vereditos: `scripts/probe-urls-offline.ts`, que importa
`probeUrlReal` do próprio link-check (mesmos defaults: timeout 20s, 512KB, host-delay
1500ms). Cruzado com `pontos_atencao` e `candidatos_publico` lidos ao vivo, mais a API
de disponibilidade do Wayback Machine.

**Nada foi aplicado.** Nenhuma claim despublicada, nenhum dado de candidato editado.

## A evidência de 29/07 está desatualizada

| Métrica | 29/07 (CI) | 02/08 (medido aqui) |
|---|---|---|
| URLs únicas | 148 | 124 |
| Vivas | 81 | 78 |
| Mortas | 36 | 25 |
| Indisponíveis | 15 | 11 |
| Sem substância | 3 | 3 |
| Sem caminho | n/r | 7 |

A migration `escopo-executivo-20260726` despublicou Senado e Câmara, então parte do
backlog de 29/07 saiu de cena sozinha.

## O achado que mais importa: isto não é link rot

A maior parte do backlog não são links que morreram. São claims que **nunca tiveram
URL de documento**: citam a raiz de um portal. Concentração:

| URL citada | Veredito | Claims que dependem dela |
|---|---|---|
| https://www.camara.leg.br | sem_caminho | 22 |
| https://www.senado.leg.br | sem_caminho | 22 |
| https://www.tse.jus.br | sem_caminho | 11 |
| https://g1.globo.com | sem_caminho | 2 |
| https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001637067 | sem_caminho | 1 |
| https://www.conjur.com.br | sem_caminho | 1 |
| https://datafolha.folha.uol.com.br | sem_caminho | 1 |

Snapshot do Wayback **não resolve** esses casos: arquivar a home do `tse.jus.br` continua
não sustentando afirmação nenhuma sobre um candidato específico. Só documento real que
morreu se recupera por snapshot.

## EM FICHA PÚBLICA (o leitor alcança hoje)

58 claims visíveis; 3 sem nenhuma fonte viva.

- (a) reancorar: **1**
- (-) aguardar: **2**

| Candidato | Grav. | Ponto de atenção | Classe | Fontes |
|---|---|---|---|---|
| Flavio Bolsonaro | alta | Discurso anticorrupção vs investigações proprias | (-) aguardar | indisponivel |
| Alvaro Dias | media | Réu em ação eleitoral sobre abuso de poder nas eleições | (-) aguardar | indisponivel |
| Marcelo Brigadeiro | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |

## FILA DE PUBLICAÇÃO (dívida a pagar ANTES de publicar)

71 claims visíveis; 64 sem nenhuma fonte viva.

- (a) reancorar: **37**
- (c) despublicar: **25**
- (-) aguardar: **2**

| Candidato | Grav. | Ponto de atenção | Classe | Fontes |
|---|---|---|---|---|
| Jair Bolsonaro | critica | Inelegivel até 2030 | (a) reancorar | sem_caminho |
| Jair Bolsonaro | critica | Indiciado por tentativa de golpe | (a) reancorar | sem_caminho |
| Jair Bolsonaro | critica | Negacionismo na pandemia: 700 mil mortes | (c) despublicar | morta |
| Jair Bolsonaro | critica | Indiciado por desvio de joias sauditas | (c) despublicar | morta |
| Michelle Bolsonaro | critica | Joias sauditas e Pix de Queiroz | (c) despublicar | morta |
| Pablo Marcal | critica | Patrimônio declarado de R$ 282 milhões incompativel com | (a) reancorar | sem_caminho |
| Pablo Marcal | critica | Laudo falso contra Boulos | (a) reancorar | sem_caminho |
| Tarcísio de Freitas | critica | Operação policial com 56 mortes em Baixada Santista | (c) despublicar | morta |
| Aldo Rebelo | alta | De comunista a aliado de Bolsonaro | (c) despublicar | morta |
| Ciro Gomes | alta | Nao apoiou Lula no 2o turno de 2018 e 2022 | (c) despublicar | morta |
| Ciro Gomes | alta | Agressao a jornalista durante campanha | (c) despublicar | morta |
| Eduardo Leite | alta | Gestão da crise das enchentes no RS criticada | (c) despublicar | morta |
| Eduardo Leite | alta | Gestão da reconstrucao pos-enchentes com reconhecimento | (c) despublicar | morta |
| Haddad | alta | Condenado em 2a instancia por caixa 2 | (c) despublicar | morta |
| Jair Bolsonaro | alta | Sigilo de 100 anos sobre gastos do cartao corporativo | (c) despublicar | morta |
| Pablo Marcal | alta | Envolvimento com piramide financeira (ABJ Marketing) | (c) despublicar | morta |
| Pablo Marcal | alta | Condenação por furto qualificado | (a) reancorar | sem_caminho |
| Tarcísio de Freitas | alta | Tiro durante comicio em Paraisopolis (2022) | (c) despublicar | morta |
| Aldo Rebelo | media | 4 partidos em 8 anos após 30 anos no PCdoB | (c) despublicar | morta |
| Aldo Rebelo | media | Ministro do Esporte durante escandalo da Copa 2014 | (c) despublicar | morta |
| Ciro Gomes | media | 7 partidos em 30 anos de carreira política | (c) despublicar | morta |
| Ciro Gomes | media | Governador do Ceará com investimento em educação | (c) despublicar | morta |
| Eduardo Leite | media | Disputou prévias do PSDB e depois trocou de partido | (c) despublicar | morta |
| Eduardo Leite | media | Reforma da previdência estadual do RS | (c) despublicar | morta |
| Michelle Bolsonaro | media | Sem experiência política ou cargo público previo | (c) despublicar | morta |
| Ratinho Junior | media | PR com menor taxa de desemprego do Sul em 2023 | (-) aguardar | indisponivel |
| Simone Tebet | media | Apoiou Temer, depois se alinhou a Lula | (c) despublicar | morta |
| Tarcísio de Freitas | media | Mudou domicilio eleitoral para SP sem residência previa | (c) despublicar | morta |
| Adriana Accorsi | baixa | Carreira política: 3 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Alexandre Curi | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Andre do Prado | baixa | Carreira política: 7 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Arnaldinho Borgo | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Aécio Neves | baixa | Absolvido no caso J&F; decisão mantida pelo TRF3 | (-) aguardar | indisponivel |
| Beto Faro | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Capitão Wagner | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Confúcio Moura | baixa | Carreira política: 4 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Da Vitoria | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Decio Lima | baixa | Carreira política: 3 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Evandro Augusto | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Gilson Machado | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Joao Capiberibe | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Joao Roma | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Jose Carlos Aleluia | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Jose Eliton | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Lahesio Bonfim | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Margarete Coelho | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Marina Silva | baixa | 4 partidos: PT, PV, PSB, Rede | (c) despublicar | morta |
| Nikolas Ferreira | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Paulo Hartung | baixa | Carreira política: 3 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Paulo Martins | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Pedro Cunha Lima | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Ratinho Junior | baixa | Herdeiro político: filho do apresentador Ratinho | (c) despublicar | morta |
| Roberto Claudio | baixa | Carreira política: 2 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Rodrigo Bacellar | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Rodrigo Pacheco | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Sergio Vidigal | baixa | Carreira política: 3 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Silvio Mendes | baixa | Sem histórico de mandato eletivo registrado | (a) reancorar | sem_caminho |
| Simao Jatene | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Soldado Sampaio | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Tarcisio Motta | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Tarcísio de Freitas | baixa | Defensor consistente de privatizações | (c) despublicar | morta |
| Tarcísio de Freitas | baixa | Aprovação acima de 50% como governador de SP | (a) reancorar | sem_caminho |
| Thiago de Joaldo | baixa | Carreira política: 1 mandato(s) registrado(s) | (a) reancorar | sem_caminho |
| Washington Reis | baixa | Carreira política: 3 mandato(s) registrado(s) | (a) reancorar | sem_caminho |

## URLs com defeito, uma a uma

| URL | Veredito | Wayback | Claims |
|---|---|---|---|
| https://www1.folha.uol.com.br/poder/2022/aldo-rebelo-bolsonaro.shtml | morta | não | 1 |
| https://www1.folha.uol.com.br/poder/2018/10/ciro-viaja-para-paris-e-nao-declara-apoio-a-hadd | morta | não | 1 |
| https://www1.folha.uol.com.br/poder/2023/01/lula-revoga-sigilos-de-100-anos-impostos-por-bol | morta | não | 1 |
| https://www1.folha.uol.com.br/poder/2024/08/marcal-piramide-financeira.shtml | morta | não | 1 |
| https://www1.folha.uol.com.br/mercado/2024/07/privatizacao-da-sabesp-e-concluida.shtml | morta | não | 1 |
| https://www1.folha.uol.com.br/poder/2020/08/michelle-bolsonaro-recebeu-r-89-mil-de-queiroz-e | morta | não | 1 |
| https://g1.globo.com/politica/eleicoes/2022/noticia/2022/09/01/ciro-gomes-e-acusado-de-agres | morta | não | 1 |
| https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/05/10/enchentes-rs-governo-criticas.g | morta | não | 1 |
| https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/reconstrucao-rs.ghtml | morta | não | 1 |
| https://g1.globo.com/sp/sao-paulo/noticia/2018/10/04/haddad-condenado-caixa-2-campanha-2012. | morta | não | 1 |
| https://g1.globo.com/sp/sao-paulo/eleicoes/2022/noticia/2022/10/paraisopolis-tarcisio.ghtml | morta | não | 1 |
| https://g1.globo.com/pr/parana/eleicoes/2018/noticia/2018/10/07/ratinho-junior-e-eleito-gove | morta | não | 1 |
| https://www.bbc.com/portuguese/brasil-45131131 | morta | não | 1 |
| https://g1.globo.com/politica/noticia/2021/10/26/relatorio-final-da-cpi-da-covid-e-apresenta | morta | não | 1 |
| https://www.bbc.com/portuguese/articles/cnk4n8e4n4eo | morta | não | 1 |
| https://g1.globo.com/politica/noticia/2024/07/04/pf-indicia-bolsonaro-no-caso-das-joias.ghtm | morta | não | 1 |
| https://g1.globo.com/sp/santos-regiao/noticia/2023/08/02/operacao-escudo-no-litoral-chega-a- | morta | não | 1 |
| https://g1.globo.com/politica/noticia/2025/aldo-rebelo-filia-dc.ghtml | morta | não | 1 |
| https://g1.globo.com/politica/noticia/2014/copa-obras-superfaturadas.ghtml | morta | não | 1 |
| https://g1.globo.com/politica/noticia/2022/10/08/ciro-gomes-anuncia-desfiliacao-do-pdt.ghtml | morta | não | 1 |
| https://g1.globo.com/educacao/noticia/ceara-modelo-educacao.ghtml | morta | não | 1 |
| https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/04/03/eduardo-leite-deixa-psdb-e-se-f | morta | não | 1 |
| https://g1.globo.com/rs/rio-grande-do-sul/noticia/2019/reforma-previdencia-rs.ghtml | morta | não | 1 |
| https://g1.globo.com/politica/eleicoes/2022/noticia/2022/10/05/simone-tebet-declara-apoio-a- | morta | não | 1 |
| https://g1.globo.com/sp/sao-paulo/eleicoes/2022/noticia/2022/04/02/tarcisio-de-freitas-trans | morta | não | 1 |
| https://www.camara.leg.br | sem_caminho | sim (20260728) | 22 |
| https://www.senado.leg.br | sem_caminho | não | 22 |
| https://www.tse.jus.br | sem_caminho | sim (20260802) | 11 |
| https://g1.globo.com | sem_caminho | sim (20260802) | 2 |
| https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/2040602022/BR/280001637067 | sem_caminho | sim (20260731) | 1 |
| https://www.conjur.com.br | sem_caminho | sim (20260731) | 1 |
| https://datafolha.folha.uol.com.br | sem_caminho | sim (20260730) | 1 |
| https://legis.senado.leg.br/dadosabertos/senador/5350/mandatos | sem_substancia | não | 1 |
| https://noticias.stf.jus.br/postsnoticias/deputado-eder-mauro-psd-pa-e-condenado-por-difamac | sem_substancia | não | 1 |
| https://noticias.stf.jus.br/postsnoticias/primeira-turma-do-stf-arquiva-habeas-corpus-em-fav | sem_substancia | não | 1 |

---

# ACHADO PRINCIPAL: isto não é link rot, são fontes fabricadas

Três medições independentes apontam para a mesma conclusão.

**1. Todas as URLs de imprensa grande estão mortas, sem exceção.** 23 de 23 URLs de
`g1.globo.com` e `www1.folha.uol.com.br` citadas em pontos de atenção retornam 404.
Nenhuma viva. Link rot real produziria mistura, não 100%.

**2. Nenhuma tem snapshot no Wayback, e o Wayback cobre esses caminhos.** Consulta à CDX
API devolve artigos reais em `g1.globo.com/politica/noticia/2024/07/`,
`g1.globo.com/politica/noticia/2021/10/` e `www1.folha.uol.com.br/poder/2024/08/`, exatamente
os prefixos citados. Se as URLs tivessem existido, o arquivo teria pelo menos uma.

**3. A estrutura das URLs não bate com o padrão real.** O G1 usa
`/noticia/AAAA/MM/DD/slug.ghtml`. Várias citadas pulam mês e dia, por exemplo
`g1.globo.com/rs/rio-grande-do-sul/noticia/2024/reconstrucao-rs.ghtml`.

Isto é o achado V1 da auditoria de 2026-07-24 ("afirmação grave sobre pessoa nomeada
publicada citando URL que nunca existiu") ainda vivo, numa forma que o gate de
20260725160000 não pega: aquele gate valida FORMATO (a URL tem caminho não vazio), e
uma URL inventada plausível tem caminho.

## As 13 que estão a uma publicação de ir ao ar

Gravidade crítica ou alta, na fila, que **passam** o gate de leitura do banco e têm
100% das fontes mortas. Se o candidato for publicado, a acusação aparece no site com
uma fonte 404 como único lastro.

| Gravidade | Candidato | Afirmação | Única fonte |
|---|---|---|---|
| **critica** | Jair Bolsonaro | Negacionismo na pandemia: 700 mil mortes | `https://g1.globo.com/politica/noticia/2021/10/26/relatorio-f` (404) |
| **critica** | Jair Bolsonaro | Indiciado por desvio de joias sauditas | `https://g1.globo.com/politica/noticia/2024/07/04/pf-indicia-` (404) |
| **critica** | Michelle Bolsonaro | Joias sauditas e Pix de Queiroz | `https://www1.folha.uol.com.br/poder/2020/08/michelle-bolsona` (404) |
| **critica** | Tarcísio de Freitas | Operação policial com 56 mortes em Baixada Santista | `https://g1.globo.com/sp/santos-regiao/noticia/2023/08/02/ope` (404) |
| **alta** | Aldo Rebelo | De comunista a aliado de Bolsonaro | `https://www1.folha.uol.com.br/poder/2022/aldo-rebelo-bolsona` (404) |
| **alta** | Ciro Gomes | Nao apoiou Lula no 2o turno de 2018 e 2022 | `https://www1.folha.uol.com.br/poder/2018/10/ciro-viaja-para-` (404) |
| **alta** | Ciro Gomes | Agressao a jornalista durante campanha | `https://g1.globo.com/politica/eleicoes/2022/noticia/2022/09/` (404) |
| **alta** | Eduardo Leite | Gestão da crise das enchentes no RS criticada | `https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/05/10` (404) |
| **alta** | Eduardo Leite | Gestão da reconstrucao pos-enchentes com reconhecime | `https://g1.globo.com/rs/rio-grande-do-sul/noticia/2024/recon` (404) |
| **alta** | Haddad | Condenado em 2a instancia por caixa 2 | `https://g1.globo.com/sp/sao-paulo/noticia/2018/10/04/haddad-` (404) |
| **alta** | Jair Bolsonaro | Sigilo de 100 anos sobre gastos do cartao corporativ | `https://www1.folha.uol.com.br/poder/2023/01/lula-revoga-sigi` (404) |
| **alta** | Pablo Marcal | Envolvimento com piramide financeira (ABJ Marketing) | `https://www1.folha.uol.com.br/poder/2024/08/marcal-piramide-` (404) |
| **alta** | Tarcísio de Freitas | Tiro durante comicio em Paraisopolis (2022) | `https://g1.globo.com/sp/sao-paulo/eleicoes/2022/noticia/2022` (404) |

Nenhuma delas foi tocada. Correção exige decisão editorial, não script.

---

# Correções a este inventário (2026-08-02, depois da verificação no CI)

Três coisas que a execução no CI expôs e que este documento afirmava errado.

## 1. A cobertura era parcial e não estava dito

O inventário acima analisou os **129 pontos visíveis**. A base tem **249**: os outros
**120 estão com `visivel = false`**, e entre eles há **22 de gravidade crítica ou alta**.
Eles estão fora do ar, então não são risco de publicação hoje, mas são o mesmo backlog e
foram omitidos sem ressalva.

## 2. As contagens exatas não são estáveis

O veredito por URL varia com o IP de origem, porque parte dos portais bloqueia robô.
Três medições do mesmo dia:

| | local | CI, run A | CI, run B (6 min depois) |
|---|---|---|---|
| Vivas | 78 | 65 | 56 |
| Indisponíveis | 11 | 32 | 43 |

Isso **não** muda veredito de defeito, porque claim com todas as fontes `indisponivel` já
é excluída do critério de falha por desenho. Mas significa que os números absolutos deste
inventário são uma fotografia de uma execução, não uma medida estável. O que é estável é
a classe do defeito: URL morta continua morta, raiz de portal continua sem caminho.

## 3. Um `sem_substancia` era falso positivo, e virou fix de código

A claim de carreira política do Jorginho Mello citava
`legis.senado.leg.br/dadosabertos/senador/5350/mandatos`, endpoint **oficial de dados
abertos do Senado**, que responde 200 com `application/xml` e 2166 bytes de dado real.
`TIPOS_NAO_HTML` cobria `json` e `pdf` mas não `xml`, então o analisador tentava extrair
texto de HTML, não achava os 500 caracteres mínimos e devolvia `sem_substancia`, que é
defeito real e derruba o gate.

Fonte primária de governo estava sendo classificada como defeito. Corrigido em
`src/lib/fonte-substancia.ts` (com `xhtml+xml` deliberadamente de fora, porque aquilo é
página para ler). A URL agora sonda `viva`.

## Estado depois das correções

- **Ficha pública: 1 claim** reprovando o gate. `Marcelo Brigadeiro` [baixa], "Sem
  histórico de mandato eletivo registrado", com fonte `https://www.tse.jus.br` (raiz de
  portal). É correção de **dado**, não de código, e não foi aplicada.
- **Backlog de quem está na disputa: 42 claims** visíveis com defeito real (34 baixa,
  5 média, 3 alta, zero crítica).
- O padrão dominante do backlog continua sendo claim que cita raiz de portal
  (`tse.jus.br`, `camara.leg.br`, `senado.leg.br`), não link que morreu.
