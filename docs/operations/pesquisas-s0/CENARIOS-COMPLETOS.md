# Cenários completos: prova de coleta

## Estado observado

O terceiro diagnóstico remoto confirmou a consulta pública do PesqEle e a captura de oito respostas no primeiro turno do Amazonas. A consolidação recebeu um de um artefato e ficou bloqueada por `identity_unresolved`, sem operação de catálogo. Execução: https://github.com/thiago-salvador/puxa-ficha/actions/runs/34347770419.

A ampliação local preserva os seis duelos de segundo turno da mesma matéria, além do primeiro turno: sete cenários e 32 respostas. Os nomes são mantidos como publicados. Nomes sem alias exato não recebem vínculo presumido com ficha. Pergunta não transcrita pela matéria continua ausente. Evidência: `/private/tmp/pf-pesquisas-s0-cenarios-am/proposal.json`.

Para Presidente, a matéria do PoderData vincula a íntegra pública em PDF. O coletor consulta esse documento, verifica o registro BR-07845/2026 e a ficha técnica, usa a coluna correspondente a 29 de julho e reconcilia a lista do primeiro turno com o Total da tabela por sexo. Tabelas demográficas não viram cenários nacionais. A coleta local conciliou seis candidatos e duas categorias no primeiro turno, mais quatro duelos com quatro respostas cada. Total: cinco cenários e 24 respostas, todas com identidade ou categoria resolvida.

Evidência presidencial: `/private/tmp/pf-pesquisas-s0-pdf-br-final/proposal.json` e `document-observations.json`. PDF: https://static.poder360.com.br/uploads/2026/07/Relatorio-PoderData-Eleitoral-29jul26-3.pdf. SHA-256: `50ae270dad241ba2fca783dccf483961c996ac07eabf52705ddd8a4648ab21c6`. Páginas de cenários: 6, 17, 18, 19 e 20. A proposta local ficou elegível para revisão; isso não equivale a publicação.

## Verificação e limites

TypeScript, ESLint, build e os cinco gates locais passaram. A suíte de PesqEle/documentos contém 17 testes. A consolidação local da captura presidencial retornou `ready`, com uma operação proposta e seis diferenças por candidato nos três duelos adicionados; os dois IDs de cenários existentes foram preservados. O diff está em `/private/tmp/pf-pesquisas-s0-pdf-consolidated/diff.json`. Nenhum catálogo foi aplicado.

Os testes rejeitam duelos sem título, nomes ou quantidade conflitantes, resultados incompletos, coluna histórica selecionada como atual, omissão de candidato com pequena participação, relatório ambíguo e metadados divergentes. IDs existentes são preservados quando a pergunta é idêntica; percentuais não entram no identificador de cenários novos.

O PDF é processado por `pdftotext -layout` com bytes em stdin, sem shell e com limites de tamanho, tempo e saída. O runner instala `poppler-utils` somente no job PoderData. Nenhum novo runtime global foi instalado no computador.

Faltam prova remota do PDF e dos sete cenários, descoberta operacional de novas publicações, cobertura BR e 27 UFs, tratamento dos casos sem identidade ou com discrepância factual, e autorização final de produção. A coleta de uma pesquisa de julho não comprova que ela seja a pesquisa mais recente. O registro Datafolha BR-04496/2026 continua com divergência entre o período declarado no PesqEle e o texto da matéria.
