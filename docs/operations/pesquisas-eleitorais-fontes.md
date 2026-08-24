# Fontes qualificadas para o piloto de pesquisas presidenciais em 2026

Consultado em: `2026-08-23T22:29:25-03:00`

## Decisão para o piloto

O piloto tem duas cadeias aprovadas e metodologicamente diferentes: PoderData/Aya e Datafolha/Folha/TV Globo. Elas bastam para exibir pesquisas comparáveis lado a lado sem produzir média, ranking ou tendência própria. Genial/Quaest permanece qualificada, mas condicional, porque Ouvidoria genérica é apenas sinal secundário e não prova uma política ou trilha pública de correções.

AtlasIntel/Bloomberg e Paraná Pesquisas também são condicionais. Seus relatórios públicos identificam metodologia e amostra, mas não foi encontrada uma trilha pública específica de correções. No caso da Paraná Pesquisas, o último relatório nacional localizado no arquivo oficial é de março de 2026. Ipsos-Ipec está excluída do recorte atual porque o resultado nacional localizado é de dezembro de 2025. O agregador Plano Político está excluído como fonte de resultado porque aplica ponderação própria.

**Aprovação significa qualificação operacional para este piloto, não que a fonte seja literalmente uma das mais confiáveis do Brasil nem que ocupe posição superior em acurácia.** Transparência, auditabilidade e publicabilidade são avaliadas no scorecard. Acurácia histórica aparece abaixo como dimensão separada e não altera o status operacional.

## Papéis que não se confundem

- **Instituto** realiza a pesquisa e responde pela metodologia e pelo resultado.
- **Contratante** encomenda ou financia a rodada. Parceiro de divulgação não vira contratante sem confirmação no PesqEle.
- **Registro oficial** é o TSE/PesqEle. Ele comprova metadados declarados, não a correção dos resultados.
- **Veículo** publica ou repercute o resultado. Ele nunca é promovido a instituto.

O [PesqEle](https://www.tse.jus.br/eleicoes/pesquisa-eleitorais/consulta-as-pesquisas-registradas) é a referência oficial por número de registro. O [conjunto aberto de 2026](https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026) informa atualização diária. O próprio TSE esclarece que não faz controle prévio dos resultados divulgados, portanto o registro sempre deve ser combinado com o relatório ou a publicação do instituto.

## Critérios binários

| Código | Critério | `true` quando |
| --- | --- | --- |
| M | Transparência metodológica | Método, campo, margem e confiança estão públicos. |
| R | Acesso ao resultado | Resultado ou relatório integral está em URL pública identificável. |
| C | Correções | Há política específica, trilha pública de erratas ou correção visível e versionada. Contato ou Ouvidoria genérica, isoladamente, não passa. |
| A | Identificação da amostra | Tamanho e população alvo estão explícitos. |
| S | Estabilidade da divulgação | Existe arquivo, landing page ou URL permanente com rodadas identificáveis. |

Para `aprovado`, M, R, A e S precisam ser verdadeiros e C deve ter evidência pública. `condicional` indica uma lacuna que exige revisão manual antes de incluir uma rodada. `excluído` indica incompatibilidade semântica ou falta de atualidade para o piloto, mesmo quando parte dos critérios é atendida.

## Scorecard

| ID estável | Status | Instituto | Contratante ou financiamento | Veículo | Registro oficial | Resultado representativo | M | R | C | A | S | Motivo |
| --- | --- | --- | --- | --- | --- | --- | :-: | :-: | :-: | :-: | :-: | --- |
| `quaest-genial-nacional-2026` | condicional | Quaest | Genial Investimentos | Quaest | TSE `BR-06591/2026` | [Quaest, 05/08/2026](https://quaest.com.br/pesquisa-genial-quaest-recuperacao-de-flavio-bolsonaro/) | true | true | false | true | true | Página do instituto traz números, campo, amostra, margem, confiança, contratante, registro e relatório. A Ouvidoria no rodapé é sinal secundário, não prova trilha de correções. |
| `poderdata-aya-nacional-2026` | aprovado | PoderData | Recursos próprios do PoderData | Poder360, com parceria de divulgação do Aya Bancah | TSE `BR-07845/2026` | [PoderData, 30/07/2026](https://www.poder360.com.br/poderdata/leia-os-resultados-da-pesquisa-poderdata-aya-para-presidente/) | true | true | true | true | true | Resultado e metodologia estão públicos; a página separa recursos próprios de parceria de divulgação, oferece canal para apontar erros e há [correção pública identificada](https://www.poder360.com.br/pesquisas/poderdata-acerta-resultado-de-lula-e-ascensao-de-bolsonaro/). |
| `datafolha-folha-globo-nacional-2026` | aprovado | Datafolha | Folha de S.Paulo e TV Globo | Folha de S.Paulo | TSE `BR-04496/2026` | [Folha, 21/08/2026](https://www1.folha.uol.com.br/poder/2026/08/datafolha-lula-marca-39-no-1o-turno-e-flavio-bolsonaro-tem-33.shtml) | true | true | true | true | true | A publicação identifica instituto, contratantes, amostra, campo, registro e resultados. A Folha mantém [política pública de erratas](https://temas.folha.uol.com.br/folha-projeto-editorial/manual-de-redacao-conduta/erramos.shtml). O veículo permanece separado do instituto. |
| `atlasintel-bloomberg-nacional-2026` | condicional | AtlasIntel | Indeterminado no relatório consultado; Bloomberg aparece no co-branding | AtlasIntel | TSE `BR-08602/2026` | [Relatório Atlas/Bloomberg, 29/07/2026](https://cdn.atlasintel.org/498dd172-4381-4192-977c-c4af9787434f.pdf) | true | true | false | true | true | O PDF público tem método RDR, amostra, campo, margem, confiança e registro. Não foi localizada trilha específica de correções, e o contratante deve ser confirmado no PesqEle por rodada. |
| `parana-pesquisas-nacional-2026` | condicional | Paraná Pesquisas | Indeterminado no relatório consultado | Paraná Pesquisas | TSE `BR-00873/2026` | [Relatório nacional, 30/03/2026](https://paranapesquisas.com.br/wp-content/uploads/2026/03/Nacional_Mar26-3.pdf) | true | true | false | true | true | O relatório público traz coleta presencial, amostra, auditoria, margem, confiança, cenários e registro. Não foi localizada política pública específica de correções, e a rodada nacional acessível é antiga frente a agosto. |
| `ipsos-ipec-nacional-2025` | excluído | Ipsos-Ipec | Ipsos-Ipec | Ipsos | Não aplicável antes de 01/01/2026 | [Ipsos, 10/12/2025](https://www.ipsos.com/pt-br/lula-lidera-hoje-todos-os-cenarios-testados-para-eleicoes-de-2026) | true | true | false | true | true | A fonte é primária e metodologicamente útil, mas o resultado nacional localizado antecede o período de registro obrigatório de 2026 e está antigo para o piloto atual. |
| `plano-politico-agregador-presidente-2026` | excluído | Não é instituto | Não aplicável | Plano Político | Reutiliza registros TSE de terceiros | [Agregador, 23/08/2026](https://www.planopolitico.com.br/agregador/presidente/) | true | false | false | false | true | Calcula ponderação e tendência próprias. Isso conflita com a regra de exibir rodadas comparáveis por fonte sem média ou ranking próprio. |

## Acurácia histórica, dimensão separada

Foi localizado um benchmark público limitado para o primeiro turno presidencial de 2022. Um documento público do CADE reproduz uma comparação nacional de pesquisas divulgadas perto da eleição, e o TSE publica o resultado final de 48,43% para Lula e 43,20% para Jair Bolsonaro. O indicador abaixo é o erro absoluto médio, em pontos percentuais, apenas para esses dois candidatos.

| Fonte atual | Evidência 2022 usada | Lula, erro absoluto | Jair Bolsonaro, erro absoluto | Erro absoluto médio | Status da dimensão |
| --- | --- | ---: | ---: | ---: | --- |
| Quaest | 49,0% e 38,0% | 0,57 | 5,20 | 2,89 | evidência limitada |
| PoderData | 48,0% e 38,0% | 0,43 | 5,20 | 2,82 | evidência limitada |
| Datafolha | 50,0% e 36,0% | 1,57 | 7,20 | 4,39 | evidência limitada |
| AtlasIntel | 50,3% e 41,1% | 1,87 | 2,10 | 1,98 | evidência limitada |
| Paraná Pesquisas | 47,1% e 40,0% | 1,33 | 3,20 | 2,27 | evidência limitada |
| Ipsos-Ipec | Não comparado | Não medido | Não medido | Não medido | `nao_medido`, a linha histórica é Ipec antes da aquisição e não foi tratada como identidade equivalente sem prova adicional |
| Plano Político | Não é instituto | Não medido | Não medido | Não medido | `nao_medido` |

Evidências: [comparação anexada a documento público do CADE](https://static.poder360.com.br/2022/10/oficio-cade-institutos-de-pesquisas-eleicoes-13out2022.pdf) e [resultado oficial do primeiro turno de 2022 no TSE](https://www.tse.jus.br/comunicacao/noticias/2022/Outubro/100-das-secoes-totalizadas-confira-como-ficou-o-quadro-eleitoral-apos-o-1o-turno).

Esse benchmark não produz ranking absoluto. É uma única eleição, considera apenas dois candidatos, reúne levantamentos com datas de campo distintas e não controla mudança tardia de voto, modo de coleta, desenho amostral ou incerteza além da margem publicada. Ele serve como evidência histórica limitada, não como selo de confiabilidade para 2026.

## Rodadas usadas como evidência

| Fonte | Campo | Publicação | Amostra | Método | Margem e confiança | Cargo e geografia | Registro |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| Genial/Quaest | 31/07 a 03/08/2026 | 05/08/2026 | 2.004 | Presencial | 2 p.p.; 95% | Presidente, Brasil, 1º e 2º turnos | `BR-06591/2026` |
| PoderData/Aya | 26 a 29/07/2026 | 30/07/2026 | 2.400 | Telefônico por URA | 2 p.p.; 95% | Presidente, Brasil, 1º e 2º turnos | `BR-07845/2026` |
| Datafolha | 18 a 20/08/2026 | 21/08/2026 | 2.058 | Presencial em pontos de fluxo | 2 p.p.; 95% | Presidente, Brasil, 1º e 2º turnos | `BR-04496/2026` |
| AtlasIntel/Bloomberg | 22 a 27/07/2026 | 29/07/2026 | 5.021 | Recrutamento digital aleatório, RDR | 1 p.p.; 95% | Presidente, Brasil, 1º e 2º turnos | `BR-08602/2026` |
| Paraná Pesquisas | 25 a 28/03/2026 | 30/03/2026 | 2.080 | Presencial domiciliar | 2,2 p.p.; 95% | Presidente, Brasil, 1º e 2º turnos | `BR-00873/2026` |

## Regra operacional de uso

1. Incluir automaticamente apenas fontes `aprovado`. Aprovação é qualificação para o piloto, não ranking de acurácia.
2. Exigir revisão humana por rodada para fonte `condicional`, confirmando contratante, registro, URL do resultado e eventual correção.
3. Nunca usar fonte `excluído` como resultado da pesquisa.
4. Se a página do instituto estiver indisponível, mídia pode fornecer o resultado somente como fallback. Guardar instituto, contratante, veículo e URLs em campos separados.
5. Tratar o registro TSE como metadado oficial, não como endosso da qualidade ou do resultado.
6. Não combinar cenários, geografias, turnos, perguntas ou datas incompatíveis. Falha de acesso vira `erro` ou `indeterminado`, nunca zero.

## Quatro passes de verificação

1. **Descoberta:** consulta às páginas oficiais dos institutos, arquivo de relatórios e TSE/PesqEle.
2. **Separação de papéis:** instituto, contratante, parceiro de divulgação, veículo e registro foram normalizados sem inferência por fama.
3. **Cruzamento:** cada rodada representativa foi conferida por resultado, metodologia, amostra, período e número TSE. Acurácia histórica foi mantida em dimensão separada.
4. **Passe adversarial:** fontes antigas, agregadores, ausência de política de correções, Ouvidoria genérica, paywall e co-branding ambíguo foram tratados como condição ou exclusão, sem promover mídia a instituto nem transformar um caso histórico em ranking absoluto.

Nenhuma instrução encontrada nas páginas consultadas foi executada. A pesquisa foi somente leitura e não enviou mensagens, não alterou contas e não tocou banco ou superfícies remotas.
