# Cobertura da coorte pública nos coletores

## Decisão

Não copiar o SQ de 2026 do banco para todo o seed e não alterar o resolver histórico nesta correção. Para sanções, selecionar diretamente os candidatos da view pública e conservar a validação de CPF e de identidade já existente no coletor.

O banco define quem está publicável agora. O seed conserva identificadores e referências curatoriais necessários a outros coletores. Essas responsabilidades não são intercambiáveis: ampliar a fila não cria um identificador histórico, parlamentar ou Wikidata válido.

## Medição de 04/09/2026

Comparação da coorte pública capturada em 04/09 com o seed do checkout de referência `808b00abe8e7a21b923da72448bdaeb238406f81`:

| Conjunto | Quantidade |
| --- | ---: |
| Fichas na view pública | 209 |
| Fichas públicas presentes no seed | 164 |
| Fichas públicas ausentes do seed | 45 |
| Ausentes do seed com CPF de checksum válido | 44 |
| Ausentes do seed sem CPF | 1 |

São contagens de um snapshot, não constantes de produção nem autorização para executar uma coleta. CPF com checksum válido é pré-requisito, não prova suficiente de identidade; a conferência do documento e, quando mascarado, do nome retornado continua obrigatória.

## Por que não sincronizar o SQ globalmente

1. `ingest-tse.ts` e `ingest-tse-historico.ts` consultam eleições anteriores a 2026. O SQ de 2026 não resolve a identidade nesses anos.
2. O resolver genérico não tem o mesmo contrato de comparação entre banco, seed e fonte do caminho dedicado de julgamento. Enriquecer o objeto de entrada não substitui essas validações.
3. A interseção seed/view exclui as 45 fichas mesmo que os SQs das outras 164 sejam preenchidos. Sincronizar apenas os identificadores não fecha a cobertura.
4. `CandidatoConfig` exige dados que alguns coletores não precisam e não representa todos os cargos da coorte pública. Um cadastro sintético global poderia esconder ausência de IDs curatoriais.

## Recorte implementado

Sanções é uma frente operacional independente do SQ eleitoral. O coletor já lê CPF e nome do banco, valida o CPF, confere o documento da resposta e recusa divergência de nome em documento mascarado. A alteração se limita à seleção inicial de candidatos públicos e ao respeito ao recorte `PF_INGEST_SLUGS`.

O cron atual executa Câmara e Senado. Sanções é alcançável por dispatch manual e pelo CLI de ingestão; mudar sua seleção não executa uma coleta nem atualiza dados existentes.

Aceitação da seleção:

- incluir uma ficha pública mesmo que ela não exista no seed;
- excluir fichas que não estejam na view pública;
- aceitar recorte explícito de ficha pública ausente do seed;
- recusar recorte desconhecido e falhas de leitura, sem ampliar silenciosamente o lote;
- manter os filtros existentes de CPF, documento e nome;
- não alterar o helper histórico, o seed ou o resolver TSE.

## Consumidores preservados

| Consumidor | Por que não ampliar automaticamente |
| --- | --- |
| TSE patrimônio, financiamento e histórico | Precisam de identidade correspondente à eleição histórica. |
| TSE situação legado | Mistura anos atuais e históricos; não deve receber uma âncora única reutilizada entre anos. |
| Câmara, Senado, CEAPS e Jarbas | Inclusão na coorte não fornece os IDs parlamentares necessários. |
| Wikipedia, Wikidata e enriquecimentos relacionados | Títulos, QIDs e referências editoriais precisam ser validados; nome não basta. |
| TCU | Pode ter uma correção própria de coorte, mas não faz parte deste recorte. |
| Transparência, filiação e notícias | Sincronizar SQ não resolve as dependências de nome ou as particularidades dessas fontes. |

## Limite de entrega

A verificação de roster é somente leitura. Não prova existência de sanções, ausência de sanções, sucesso de chamada à CGU ou atualização do site. Uma execução futura precisa de recorte definido, leitura dos recibos, conferência do banco e verificação da superfície pública.
