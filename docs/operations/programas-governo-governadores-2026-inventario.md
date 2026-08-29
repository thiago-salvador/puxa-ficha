# Inventário oficial de programas de governo, governadores 2026

## Resultado da coleta

O recorte foi atualizado em 29 de agosto de 2026 sobre a geração TSE de 27 de agosto de 2026, 12:30:35. O arquivo versionado é `scripts/data/programas-governo-governadores-2026/inventario-2026-08-29.json`.

| Medida                                       |         Resultado |
| -------------------------------------------- | ----------------: |
| UFs                                          |                27 |
| Linhas oficiais de candidaturas a governador |               198 |
| Grupos lógicos                               |               197 |
| Grupos oficialmente ambíguos                 | 1 grupo, 2 linhas |
| Perfis locais vinculados por SQ_CANDIDATO    |               197 |
| Perfis locais ausentes                       |                 0 |
| Alias de duplicidade oficial                 |                 1 |
| Pacotes estaduais                            |                27 |
| PDFs nos pacotes                             |               212 |
| PDFs ligados à coorte atual                  |               206 |
| PDFs sem candidatura atual                   |                 6 |
| Candidaturas com PDF                         |               193 |
| Ausências explícitas de PDF                  |                 5 |
| Páginas da coorte atual                      |            11.110 |
| Texto extraído da coorte atual               |  21.986.975 bytes |
| PDFs atuais que requerem OCR                 |                 5 |

## Fontes e integridade

- Catálogo primário: [Candidatos 2026, Dados Abertos do TSE](https://dadosabertos.tse.jus.br/dataset/candidatos-2026).
- Cadastro: `consulta_cand_2026.zip`, 3.139.062 bytes, SHA-256 `eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27`.
- Propostas: 27 recursos estaduais `proposta_governo_2026_UF.zip`, 278.446.551 bytes comprimidos no total. O inventário guarda URL de catálogo, URL do pacote, tamanho, SHA-256 e caminho interno de cada PDF.
- Um PDF individual não tem URL oficial independente no catálogo. Por isso, a proveniência correta é a URL do pacote mais `arquivoNoPacote`, nunca uma URL inventada.
- O acesso direto do shell à CDN respondeu HTTP 403. O navegador Playwright conseguiu obter os arquivos pelos links do catálogo. Isso prova apenas disponibilidade por esse transporte. A integridade de conteúdo foi verificada separadamente com teste de cada ZIP, assinatura PDF, páginas e SHA-256 de pacote e documento.

## Cobertura por UF

| UF  | Candidaturas | Com documento | Sem documento | PDFs atuais | PDFs órfãos | Páginas atuais |
| --- | -----------: | ------------: | ------------: | ----------: | ----------: | -------------: |
| AC  |            6 |             6 |             0 |           6 |           0 |            237 |
| AL  |            4 |             4 |             0 |           4 |           0 |             77 |
| AM  |            7 |             7 |             0 |          14 |           0 |          1.839 |
| AP  |            5 |             5 |             0 |           5 |           0 |            166 |
| BA  |            7 |             7 |             0 |           7 |           0 |            408 |
| CE  |            9 |             8 |             1 |           8 |           1 |            304 |
| DF  |           11 |            11 |             0 |          12 |           0 |            896 |
| ES  |            5 |             5 |             0 |           5 |           1 |            353 |
| GO  |            6 |             6 |             0 |           7 |           0 |            359 |
| MA  |            8 |             8 |             0 |           8 |           1 |            682 |
| MG  |           11 |            10 |             1 |          10 |           0 |            456 |
| MS  |            8 |             8 |             0 |           8 |           0 |            269 |
| MT  |            7 |             7 |             0 |           7 |           0 |            420 |
| PA  |            7 |             7 |             0 |           7 |           0 |            314 |
| PB  |            6 |             6 |             0 |           6 |           0 |            161 |
| PE  |            8 |             8 |             0 |           8 |           1 |            318 |
| PI  |           11 |            11 |             0 |          11 |           1 |            388 |
| PR  |            8 |             8 |             0 |           9 |           0 |            543 |
| RJ  |            9 |             7 |             2 |           7 |           1 |            445 |
| RN  |            9 |             9 |             0 |           9 |           0 |            315 |
| RO  |            6 |             6 |             0 |           7 |           0 |            436 |
| RR  |            5 |             5 |             0 |           5 |           0 |            143 |
| RS  |            7 |             7 |             0 |           7 |           0 |            383 |
| SC  |            8 |             8 |             0 |           8 |           0 |            247 |
| SE  |            6 |             6 |             0 |           6 |           0 |            242 |
| SP  |            7 |             6 |             1 |           8 |           0 |            418 |
| TO  |            7 |             7 |             0 |           7 |           0 |            291 |

## Ausências explícitas

| UF  | Candidatura     | Partido      | SQ_CANDIDATO   | Perfil local |
| --- | --------------- | ------------ | -------------- | ------------ |
| CE  | Vera Lúcia      | NOVO         | `60002553922`  | vinculado    |
| MG  | Ben Mendes      | MISSÃO       | `130002544411` | vinculado    |
| RJ  | Eduardo Paes    | PSD          | `190002543380` | vinculado    |
| RJ  | Garotinho       | REPUBLICANOS | `190002550196` | vinculado    |
| SP  | Policial Edjane | AGIR         | `250002548080` | vinculado    |

Ausência significa que nenhum arquivo com o SQ_CANDIDATO atual foi encontrado no pacote oficial da UF. Não autoriza associação por nome, partido ou similaridade.

## Ambiguidade atual

O cadastro oficial contém duas linhas de MT para Laudicerio Aguiar Machado, AGIR, com o mesmo número e SQ_COLIGACAO distintos:

- `110002553937`, SQ_COLIGACAO `110001801468`, nome de urna `SARGENTO LAUDICÉRIO (LAU)`.
- `110002554073`, SQ_COLIGACAO `110001801510`, nome de urna `SARGENTO LAUDICÉRIO`.

Os dois PDFs têm texto extraído integralmente idêntico, SHA-256 `2641361633f792d511c2bd2b62f99c807858a6760afda2b97e71336cbb78d7d7`. O inventário consolida deterministicamente a menor SQ como registro canônico da ficha `laudicerio-aguiar`; a outra linha permanece como `alias_duplicidade_oficial`, sem gerar um segundo programa nem sobrescrever a mesma ficha.

## Arquivos sem candidatura atual

Todos os seis arquivos foram preservados. Eles não são vinculados por nome ou por histórico:

| Documento                      | Páginas |     Bytes | SHA-256                                                            |
| ------------------------------ | ------: | --------: | ------------------------------------------------------------------ |
| `CE/2026CE60002540418_01.pdf`  |      50 |   788.262 | `b716a6fed3abeebf5ff0b6af4fd7b6fd2cd0d08982b7cdaec02c945f7e5e60a3` |
| `ES/2026ES80002541013_01.pdf`  |      61 | 1.975.005 | `aa288d9a332f2e7aeec90ceab6b82b80c07cf288011ae59b3f1607aa2cbff972` |
| `MA/2026MA100002544075_01.pdf` |      46 |   283.658 | `d844ecd625694b6eaa614e6958a94f6bb8aa6ecdfef4621d470d0f26cb346103` |
| `PE/2026PE170002540338_01.pdf` |      66 |   894.225 | `cee039360efea5a9a11be2624b3f8aa23e384eb17ba8100d664b93ba5bb44f6c` |
| `PI/2026PI180002533958_01.pdf` |       3 |    26.771 | `3dcc283f0f19d8982176f404a73258e2240d657597e5649cd38d1e652bdd5765` |
| `RJ/2026RJ190002543534_01.pdf` |       3 |   130.166 | `bf6565aa3f42fa13d6889c5f898343f7c1d7b12b80e06d81efe7dcc10f2e548f` |

O antigo SQ de Elizeu Aguiar, PI `180002533958`, é um desses arquivos. A linha atual é `180002549920`, possui seu próprio PDF e está confirmada separadamente.

## Reprodutibilidade

O gerador exige Node 24, o ZIP nacional de candidaturas, os 27 ZIPs estaduais e um horário de coleta ISO. A auditoria recalcula chaves compostas, unicidade, cobertura, integridade dos campos de proveniência, somas e ausências. A atualização só deve substituir o snapshot após nova coleta integral, nunca por edição manual de contagens.
