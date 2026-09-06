# Programa de Ben Mendes: do anúncio oficial à publicação

O DivulgaCandContas listou o arquivo `130017139584`, tipo `5`, para a
candidatura de Ben Mendes ao governo de MG (`130002544411`). A consulta
HTTP 200 de 04/09/2026 às 15:06:05.782 UTC está preservada no artefato de
[auditoria do GitHub Actions](https://github.com/thiago-salvador/puxa-ficha/actions/runs/33887424607).
A [fonte específica do TSE](https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MG/20322002026/candidato/130002544411)
retornou o nome `pje-0601954-55.2026.6.13.0000 Plano de Governo.pdf`.

O registro público usa `documento_anunciado`: não afirma ausência de programa,
download concluído, leitura, extração ou resumo aprovado. A interface informa
“Resumo pendente” e identifica que o link abre os metadados da candidatura em
JSON. O link não é apresentado como download do PDF.

## Proveniência e limite da evidência

O JSON de Ben contém somente metadados públicos selecionados. `payloadSha256`
é o SHA-256 da resposta JSON bruta preservada no artefato da auditoria:
`6f8138d36cb5093f612d37bf3c8aafd0e5871a21fe2ee5b6e1ec66895bfaee8c`.
`metadadosSha256` protege a serialização dos campos selecionados na ordem
validada pelo schema. Nenhum dos dois é hash do PDF ou assinatura do TSE.
O payload bruto não é copiado para este registro público.

O catálogo oficial anuncia o
[pacote de propostas de MG](https://dadosabertos.tse.jus.br/dataset/candidatos-2026/resource/72831fd0-1ace-4834-8d7e-746d190baeb0).
Nesta investigação o download do ZIP retornou HTTP 403 ou bloqueio do browser;
uma nova consulta à API também retornou 403. Isso não invalida a resposta
preservada, mas impede afirmar disponibilidade atual dos bytes. Não houve
contorno do bloqueio, PDF obtido, extração, chamada paga a modelo ou aprovação
editorial. Não se inventou um caminho de PDF dentro do pacote.

O inventário de pacotes e o recibo de ausência de 30/08 permanecem históricos.
O gerador de estados de ausência não deve reaplicar o recibo antigo de Ben por
cima do anúncio posterior. O auditor mantém um resumo pendente, zero aprovação
adicional e os mesmos totais de claims aprovadas. O monitor de documentos TSE
continua pendente: metadados não resolvem a revisão documental.

## Retomada canônica quando o download oficial estiver acessível

Usar Node.js 24. Obter o pacote pelo catálogo oficial, sem contornar controles
de acesso. Validar bytes, identidade, hash e páginas pelo inventário canônico
antes de passar o candidato ao importador. Não regenerar o inventário nacional
com um único ZIP: seu contrato inclui o universo e os 27 pacotes estaduais.

```bash
node --import tsx scripts/programas-governo-governadores-2026.ts \
  --ufs=MG --sq-candidato=130002544411 \
  --inventory=/caminho/privado/inventario-validado.json \
  --archive-dir=/caminho/privado/pacotes \
  --output-dir=/caminho/privado/ben-mendes --plan-only
```

A extração canônica usa `pdftotext`, com OCR apenas onde necessário. A geração
posterior exige configuração e orçamento explícitos de modelos, resumo com
evidência literal por página, julgamento independente e aprovação humana por
item. O importador não produz `aprovado` automaticamente. Seguir o
[roteiro de ingestão](programas-governo-governadores-2026-ingestao.md) para
geração, staging e aprovação. Não substituir `documento_anunciado` por
`em_revisao` sem a extração e o resumo que esse estado exige.

Regenerar o manifesto após uma mudança validada no registro:

```bash
node --import tsx scripts/programas-governo-governadores-2026-manifesto.ts
npm run audit:programas-governo:governadores:publicados
```

Esta correção local não fecha a issue #253. Além da pendência documental de
Ben, o alerta de Subtenente Luiz Carlos compara a ficha pública com o universo
ativo do TSE: atualizar a situação no banco não remove esse alerta enquanto a
ficha continuar pública. Despublicar a ficha é decisão editorial separada, não
um meio de fazer o gate passar. Nenhuma issue, ficha ou publicação editorial é
alterada por este roteiro.

## Atualização de 05/09: PDF obtido, rascunho local não publicado

O bloqueio descrito acima permanece como histórico da investigação de 04/09.
Na execução [33998003451](https://github.com/thiago-salvador/puxa-ficha/actions/runs/33998003451),
o runner obteve o ZIP oficial de MG com HTTP 200 em
`2026-09-05T23:12:24.865Z`. O pacote tem 19.972.034 bytes,
`Last-Modified: Sat, 05 Sep 2026 06:48:58 GMT` e SHA-256
`0004837d38bb429bd893695ce137801ba65d73e9c49ac27df8d2f38167fa72cb`.
Seu inventário contém 12 membros e exatamente um PDF com o SQ de Ben:
`MG/2026MG130002544411_01.pdf`.

O PDF tem 1.256.027 bytes, 97 páginas e SHA-256
`277d3eee53e0b0428d11e54c6cfeef5190f97bd86ff07202f52033e788cc5fab`.
A capa judicial identifica Benoni Benjamin Cardoso Mendes, candidato a
governador pelo Partido Missão. Isso comprova a obtenção de um documento
oficial associado à inscrição, não aprovação editorial das suas propostas.

O adapter canônico `extractProgramaPdf()` produziu 97 seções e 97 entradas
ordenadas em `pageMap`, todas por `pdftotext`, com hashes individuais
conferidos. A extração usa `programa-governo-extracao-v2`, método
`pdftotext-pagewise-with-ocr-fallback`, e SHA-256 do texto canônico
`76dd727b4ce45fa3e91b9225ae7ffb8c3b011062ab36f1954c215ab330a7ffb6`.
As páginas citadas são as posições físicas no PDF, incluindo a capa do PJe;
a paginação impressa do sumário não foi usada como âncora.

Foi preparado um primeiro rascunho local pelo assistente Codex, com 145 palavras,
oito frases, seis temas e 25 trechos localizados na extração por comparação
literal com espaços normalizados. Os artefatos estão no diretório de
trabalho ignorado `reports/ben-mendes-closeout/`: `provenance.json`,
`extraction.json`, `review-draft.json`, `review-package.json`, `review.md`
e `verification.json`. O PDF e a extração integral incluem a capa e os
carimbos judiciais do original; são material local de revisão, não arquivos
a publicar automaticamente.

Na primeira preparação, não houve invocação de runners externos de modelos, julgamento independente,
aprovação humana, alteração do inventário nacional, migração de banco,
troca do registro público ou modificação do monitor. O rascunho não é um
registro publicável e não equivale a `em_revisao` aprovado pelo pipeline.
O alerta documental continua pendente até a revisão canônica ser concluída.
O recibo `ausente_do_pacote` não se aplica: o arquivo foi encontrado.

Registro operacional: extração e rascunho locais verificados, sem publicação.
[confidence: alta, source: GitHub Actions 33998003451, ZIP oficial TSE, extractProgramaPdf e reports/ben-mendes-closeout/verification.json]
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

### Revisão independente por assistente e segunda versão local

A tarefa independente `release_workflow` revisou o primeiro rascunho e pediu
três correções: explicitar as condicionalidades do Casa que Educa, representar
o foco mineral na industrialização de terras raras e na cadeia da mina ao ímã,
e incluir o Fundo Soberano Mineiro no lugar da síntese de energia e turismo.
As três alterações foram incorporadas com evidências nas páginas físicas
14, 15, 66, 67, 68 e 96. O rascunho atualizado tem 158 palavras, oito frases,
seis temas e 28 trechos conferidos literalmente. A releitura independente
após os ajustes concluiu `PASS_FOR_HUMAN_REVIEW`, sem achados acionáveis
restantes. O recibo privado `review-assistant-verdict.json` identifica
`humanApproved: false` e `published: false`.

Essa revisão foi realizada por outro assistente, não por Thiago nem por um
revisor humano. Não constitui execução do judge do pipeline canônico,
aprovação humana, publicação ou validação da viabilidade das propostas.
O monitor, o registro público e o inventário nacional permanecem inalterados.
[confidence: alta, source: revisão da tarefa release_workflow, reports/ben-mendes-closeout/review-package.json e verification.json]
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]

## Fechamento em 06/09/2026

O pacote oficial e a extração preservados foram novamente conferidos. Dois
judges independentes validaram as oito frases, os seis temas, as 28 evidências
e as 97 páginas, sem achados acionáveis. A publicação solicitada por Thiago
Salvador nesta sessão promoveu o registro para `aprovado`, sem atribuir a ele
uma revisão de conteúdo que não realizou. O recibo identifica separadamente a
síntese do Codex, o julgamento do GPT-6 Astra e a solicitação de publicação.

O inventário passou a conter `MG:130002544411:01`, com SHA-256
`277d3eee53e0b0428d11e54c6cfeef5190f97bd86ff07202f52033e788cc5fab`.
Ben saiu do monitor de documentos pendentes; um novo `id_arquivo` oficial volta
a exigir revisão pelo fluxo de atualização do inventário.

[confidence: alta, source: ZIP oficial TSE da execução 33998003451, review-package.json, judges independentes e auditorias locais]
[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
