# Escala dos programas de governo, governadores 2026

## Decisão

A arquitetura estática server-only cabe com margem, sem armazenamento ou serviço remoto adicional. A resposta deve ser fragmentada por documento ou por seção. Um único payload com todo o programa de um candidato é rejeitado.

O relatório versionado está em `scripts/data/programas-governo-governadores-2026/escala-2026-08-26.json`.

## Medições reais

Build limpo em Node 24.15.0, SHA `72b1ba223ce5c5418222bc03ef309eefa2bbfd95`:

| Medida                             |                     Resultado |
| ---------------------------------- | ----------------------------: |
| Duração do build                   |                     21.730 ms |
| Arquivos em `.next`, sem cache     |                           998 |
| Saída `.next`, sem cache           |              29.666.132 bytes |
| Arquivos estáticos                 |                            82 |
| Bytes estáticos                    |                     3.841.008 |
| Funções de rota                    |                            40 |
| Trace atual de `candidato-profile` | 4.974.012 bytes, 264 arquivos |

Base presidencial observada:

| Medida                 |       Resultado |
| ---------------------- | --------------: |
| Registros JSON         |              13 |
| Páginas                |             816 |
| JSON total             | 2.168.492 bytes |
| Conteúdo textual       | 1.711.933 bytes |
| Fator JSON sobre texto |         1,26669 |

Projeção estadual a partir dos 21.874.177 bytes de texto extraídos:

| Medida                               |                        Resultado |
| ------------------------------------ | -------------------------------: |
| JSON server-only projetado           |                 27.707.942 bytes |
| Função projetada                     |                 32.681.954 bytes |
| Meta interna de segurança da função  | 183.500.800 bytes, 70% do limite |
| Maior payload por candidato          |                  4.221.177 bytes |
| Meta interna de segurança do payload |   3.774.873 bytes, 80% do limite |
| Maior payload por documento          |                  1.029.836 bytes |

A projeção aplica ao texto estadual o fator observado `JSON total / conteúdo textual` do corpus presidencial. É conservadora porque inclui a sobrecarga real de metadados, seções, resumo e serialização do corpus existente.

## Caso limite, Omar Aziz

O pacote do Amazonas contém oito arquivos para o SQ_CANDIDATO `40002532272`:

| Parte | Páginas |  PDF bytes | Texto bytes | SHA-256                                                            |
| ----- | ------: | ---------: | ----------: | ------------------------------------------------------------------ |
| 01    |     243 |  8.459.864 |     517.693 | `154c981e4aee62d4f59ebe700c38e5f8ead53c32729be464c1fb0e25137d80e6` |
| 02    |     262 | 10.195.164 |     549.515 | `525ae31d6031e72374f5abfb39156b826ff0753bf2b99ec3e49326dd5aa25ad5` |
| 03    |     211 | 10.167.090 |     440.994 | `1d26104c99596077ac63fd3bf65085002294c31377c144106b33af9c2b048b66` |
| 04    |     215 | 10.203.763 |     442.353 | `5907da46ac3a2a3bbaf6c3fbb26c680945d59a8d1e3ae7dc0c411efe96f914e7` |
| 05    |     274 | 10.285.667 |     581.584 | `c00bedc1f5443c2ab238e26eebe5a522a41afd76a1b76b73fefebfe5cf1b94d9` |
| 06    |      49 |  1.145.980 |     104.324 | `6f91717227deed0589596df0a400afd62a7926fd9f1bd2535d7bf425c7f68173` |
| 07    |      83 | 10.170.299 |     174.405 | `767d2062c62de7c4dbdfbf36b2ab724ba230d6806f3266569580957803662076` |
| 08    |     215 | 10.162.707 |     521.573 | `4cf49f539f36d6c3a77406dd23f27ca8d59c53b8e0dd9cc1a9738bcad742e3d0` |
| Total |   1.552 | 70.790.534 |   3.332.441 | 8 hashes únicos                                                    |

Os oito PDFs são partes segmentadas distintas, não cópias nem versões sucessivas. A conclusão é sustentada por oito hashes PDF únicos, oito hashes do texto normalizado únicos, aberturas temáticas diferentes e sobreposição textual muito baixa. A maior similaridade Jaccard entre pares, calculada sobre shingles de cinco palavras, foi 0,0151. Os horários internos de criação estão agrupados em poucos segundos, o que é compatível com exportação segmentada do mesmo conjunto.

Somar as oito partes projeta 4.221.177 bytes em uma resposta. Isso fica abaixo do limite absoluto de 4,5 MiB, mas acima da meta de segurança de 80%, com margem insuficiente para evolução de schema, headers e variação de serialização. O maior documento isolado de toda a coorte projeta 1.029.836 bytes e cabe com ampla margem.

## Limites e contrato

- [Vercel Functions limits](https://vercel.com/docs/functions/limitations): 250 MiB descomprimidos por função e 4,5 MiB por request ou response.
- [Vercel build limits](https://vercel.com/docs/limits): referência oficial para tempo máximo de build.
- Meta interna: usar no máximo 70% do limite de função e 80% do limite de payload.

Contrato recomendado:

1. Manter metadados e conteúdo versionados estaticamente, importados apenas no servidor.
2. Preservar cada PDF como documento independente, com `documentoId`, caminho no pacote e hash próprios.
3. Carregar conteúdo por documento ou por seção, nunca concatenar todos os documentos em uma única resposta.
4. Tratar o índice do candidato como manifesto leve, sem incluir o texto integral.
5. Falhar fechado se um documento, seção, hash ou identidade composta divergir.

Não há justificativa medida para infraestrutura remota. O gatilho para reavaliar essa decisão é a função projetada ultrapassar 70% de 250 MiB, o maior chunk ultrapassar 80% de 4,5 MiB ou o build aproximar-se do limite oficial com margem operacional menor que 30%.
