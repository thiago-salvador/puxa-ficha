# Programa de Ben Mendes: anúncio oficial, resumo pendente

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
