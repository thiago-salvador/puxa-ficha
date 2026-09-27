# Bens TSE de 2002 e 2004

## Conclusão

O catálogo oficial do Portal de Dados Abertos do TSE não publica recurso de declaração de bens nos conjuntos de candidatos de 2002 nem de 2004. Para ambos os anos, os recursos apresentados são candidatos, coligações e vagas; em 2004 também há fotos por UF. Portanto, não há caminho alternativo de ZIP de bens indicado pelo catálogo consultado. Registre esses anos como fora da série oficial disponível, e não como `vazio_confirmado` por ausência individual de bens.

## Evidência headful no catálogo

- [Conjunto Candidatos - 2002](https://dadosabertos.tse.jus.br/dataset/candidatos-2002): a página descreve “Candidatos - Coligações - Vagas”. Os recursos exibidos são Candidatos (`a455f101-0ce1-41f9-8130-5bebfad13c2a`), Coligações (`e2e1e0c6-a4df-4fe6-9c5d-c02b11bd245a`) e Vagas (`bbcb7014-6ee3-440c-b124-f16b1224ddea`). Não há recurso “Bens”. Fonte indicada na página: sistemas CAND, Candex e DivulgaCand.
- [Conjunto Candidatos - 2004](https://dadosabertos.tse.jus.br/dataset/candidatos-2004): a página descreve “Candidatos - Coligações - Vagas - Fotos de candidatos”. Os primeiros recursos exibidos são Candidatos (`4bbf1a24-b4ca-4a38-b0e4-f738153deac5`), Coligações (`1f83ddc0-2485-4f88-9e63-a5d9b42fe045`) e Vagas (`ff608a01-8b72-4ad0-a3f6-7aa326150680`), além das fotos por UF. Não há recurso “Bens”. Fonte indicada na página: sistemas CAND, Candex e DivulgaCand.
- O grupo [Candidatos](https://dadosabertos.tse.jus.br/group/candidatos) lista ambos os conjuntos e mostra para 2002 “Candidatos - Coligações - Vagas” e para 2004 “Candidatos - Coligações - Vagas - Fotos de candidatos”.

## URLs ZIP no padrão do CDN

Os URLs testados, seguindo o padrão documentado pelo código para `bem_candidato_2026.zip`, foram:

- `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2002.zip`
- `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2004.zip`

No navegador headful, ambos retornaram uma página intitulada **404 Not Found**, com o corpo “The requested URL was not found on this server.” Porém, chamadas `curl` HEAD e GET ao mesmo par de URLs retornaram **403** no ambiente de execução. Como há divergência entre as superfícies, o status HTTP do origin/CDN não fica independentemente confirmado por `curl`; o resultado 404 é evidência observada na navegação headful. Não foi encontrado link alternativo de ZIP nas páginas de dataset oficiais.

## Regra do repositório

- `src/lib/public-profile-dto.ts` define `PATRIMONIO_ANO_INICIAL_APLICAVEL = 2006` e comenta que a série `bem_candidato` dos dados abertos do TSE começa em 2006.
- `scripts/audit/lib/coverage-model.ts` repete que antes de 2006 não há pacote oficial para confirmar dado nem ausência.

Assim, 2002 e 2004 são anteriores à série de patrimônio suportada. Não converter a ausência de um arquivo/catalog entry em prova de declaração vazia para pessoa alguma.
