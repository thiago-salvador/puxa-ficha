# CPF do TSE sem os zeros à esquerda

Data: 2026-08-10
Branch: `rc-cpf-zeros-esquerda` (nascida de `rc-lancamento` aa40b68)
Escopo: coleta de CPF a partir do `consulta_cand` do TSE. Item 3 da nota PF Ajustes.

Nada foi escrito em banco, nenhuma migration foi aplicada e o backfill nunca
rodou com `--apply`. Tudo que segue é leitura, dry-run e teste local.

## O defeito

O publicador do TSE trata `NR_CPF_CANDIDATO` como número, não como texto, e
come os zeros à esquerda. O coletor exigia 11 dígitos crus e descartava a linha
em silêncio. Resultado: CPF verdadeiro jogado fora por formatação da fonte, e a
ficha seguia na lista de "não consultáveis" da varredura de sanções.

## A prova

Linha real do pacote oficial, lida do `consulta_cand_2012.zip` baixado do CDN do
TSE nesta sessão:

```
SQ_CANDIDATO      110000010149
NM_CANDIDATO      ALEX PEDDE PUCINELI
NR_CPF_CANDIDATO  690013167        <- 9 caracteres
DS_CARGO          VEREADOR
SG_UF             MT
```

O seed atribui esse mesmo `SQ_CANDIDATO 110000010149` (ano 2012) ao slug
`alex-pucineli`, então a rota que persiste estava disponível. O que matava o
candidato era a ordem: em `scripts/backfill-cpf-tse.ts` o filtro de CPF roda
ANTES do casamento por SQ, e a linha morria em `cpfEhValido`, que exige
`length === 11`.

Dígito verificador conferido de forma independente, fora do código do projeto:
`00690013167` fecha nos dois dígitos (esperado 6 e 7, calculado 6 e 7).
`690013167` cru é recusado, como tem que ser.

### Quanto do pacote está danificado

Distribuição do comprimento de `NR_CPF_CANDIDATO` e taxa de aprovação no dígito
verificador depois do padding, medida nesta sessão:

| Pacote | 1 dígito | 6 a 10 dígitos | 11 dígitos |
|---|---|---|---|
| `consulta_cand_2012_MT` (10.913 linhas) | 52 linhas, 0% DV | 1.965 linhas, 100% DV | 8.896 linhas, 100% DV |
| `consulta_cand_2016` inteiro (996.782) | 218 linhas, 0% DV | nenhuma | 996.564, 100% DV |
| `consulta_cand_2022` inteiro (58.644) | 58 linhas, 0% DV | nenhuma | 58.586, 100% DV |

Duas leituras importam aqui. Primeira: o dano é dos pacotes antigos, os
recentes vêm íntegros. Segunda, e é a que sustenta a correção: das 1.965 linhas
danificadas em MT 2012, 100% passam no dígito verificador depois de recompor os
zeros. Se fossem lixo, cerca de 1% passaria. São CPFs verdadeiros.

As linhas de 1 dígito são os marcadores do TSE (`-1`, `0`, e o `-4` que aparece
adiante). Nenhuma passa no DV, e nenhuma deve passar.

## A correção

Núcleo novo em `scripts/lib/cpf.ts`, com `somenteDigitos` e `cpfEhValido`
mudados de casa para lá (o `ingest-transparencia-sanctions` reexporta, então
quem já importava de lá continua funcionando). A função nova é
`normalizarCpfTse`, e a regra dela é assimétrica de propósito:

- **11 dígitos** é o que a fonte publicou inteiro. Volta como veio. Cada
  chamador já tem o seu gate depois disso, e validar aqui mudaria comportamento
  histórico em cima de dado que ninguém reconstruiu.
- **9 ou 10 dígitos** é reconstrução nossa, não dado da fonte. Reconstrução
  exige prova: o valor completado só passa se o dígito verificador fechar.
- **Menos que o piso, ou mais que 11**, não é CPF danificado. Não adivinhamos.

### O piso, e por que 9

O risco oposto ao defeito é transformar lixo curto em CPF aparentemente válido.
O dígito verificador ajuda menos do que parece nessa hora: ele derruba cerca de
99 em cada 100 valores, e essa taxa não melhora com o comprimento. Entre 0 e
9999 existem 99 valores que passam no DV depois do padding. O piso não aposta na
sorte do DV, ele exclui os FORMATOS que o lixo costuma ter: ano, contador,
código pequeno.

A medição acima mostra dano até 6 dígitos, todos válidos, então um piso 6 seria
defensável pela fonte. Ele foi testado de verdade: o backfill inteiro rodou com
piso 6 contra os mesmos 30 alvos e produziu decisão idêntica, alvo por alvo.
Como não compra nada medível e alarga a superfície de reconstrução, ficou o piso
mais apertado. Quando aparecer alvo real que só o piso 6 fecha, a troca terá
evidência; hoje não tem.

## Os pontos do código conferidos

Varredura por `NR_CPF`, `cpfEhValido` e `somenteDigitos` em `scripts/` e `src/`.
O mesmo piso de 11 dígitos crus estava copiado em quatro lugares, cada um com o
seu próprio nome, e os quatro passaram a usar o núcleo compartilhado:

| Arquivo | O que fazia | O que o defeito custava ali |
|---|---|---|
| `scripts/backfill-cpf-tse.ts` | `somenteDigitos` + `cpfEhValido` na varredura | descartava a linha antes do casamento por SQ. É o ponto do `alex-pucineli` |
| `scripts/lib/tse-resolver.ts` | `normalizeCPF` local | apagava a chave inteira, o degrau de CPF nem era tentado e a linha caía para o casamento por nome, que é mais fraco |
| `scripts/lib/ingest-tse-situacao.ts` | `normalizeCPF` + `getValidCPF` locais | `cpf_present` saía false e o CPF verdadeiro nunca era gravado em `candidatos.cpf` |
| `scripts/curadoria-processos-lote.ts` | gravava `row.NR_CPF_CANDIDATO` cru no dossiê | o consumidor (`aplicar-evidencia-processos-curadoria`, linha 232) só liga a prova por CPF quando o campo tem 11 dígitos, então a prova ficava desligada. Aqui o valor irrecuperável continua indo cru, porque perder o registro seria pior |

Fora do caminho: `scripts/lib/ingest-tcu.ts` lê CPF do banco, já normalizado, e
`scripts/lib/historico-homonym-signals.ts` extrai CPF de texto de observação,
que é outra fonte e outro problema.

## Testes

`tests/cpf-zeros-a-esquerda.test.ts`, 12 casos. `alex-pucineli` está nomeado
como regressão real, com o valor exato que o TSE publica.

- 9 dígitos com zeros comidos vira 11 e é aceito (o caso real), e 10 dígitos
  também.
- 11 dígitos continua aceito e intacto, com e sem pontuação.
- Lixo curto é recusado: tudo de 0 a 8 dígitos, incluindo `191` e `1082`, que
  são dois dos 99 valores abaixo de 10.000 que passariam no DV depois do
  padding.
- DV inválido é recusado depois do padding, tanto em 9 quanto em 10 dígitos.
- Marcadores do CSV (`#NULO#`, `NAO DIVULGAVEL`, `-1`, nulo) não viram CPF.
- CNPJ e qualquer coisa acima de 11 dígitos não é adivinhado.
- Um caso guarda a escolha do piso: `60214171` tem DV válido depois do padding e
  ainda assim é recusado, para que o piso conservador seja decisão explícita e
  não acidente.

## A medição do ganho, em modo de leitura

`npx tsx scripts/backfill-cpf-tse.ts` sem `--apply`, duas execuções contra os
mesmos pacotes do TSE (baixados uma vez, cache reaproveitado), leitura do banco
por `candidatos_publico` e `candidatos`. Nenhum ano falhou no download nas duas
rodadas.

| | antes | depois |
|---|---|---|
| alvos | 30 | 30 |
| persistíveis | 1 | 2 |
| revisão humana | 1 | 1 |
| conflitos | 0 | 0 |
| sem match | 28 | 27 |

**A correção torna 1 ficha a mais consultável: `alex-pucineli`**, via rota `sq`,
ano 2012. Essa é a única decisão que muda entre as duas rodadas.

O número é esse e não adianta enfeitar. O valor da correção não é o 1: é parar
de descartar dado verdadeiro num coletor que alimenta acusação pública. O mesmo
caminho compartilhado atende os 194 publicáveis e todo `ingest` de situação e
histórico, não só estes 30.

### Nota sobre o número da auditoria de 05/08

A nota de origem dizia `persistiveis: 0, sem_match: 30`. Hoje o baseline, com o
código velho, dá `persistiveis: 1`. A diferença não é o defeito: é o pacote
`consulta_cand_2026`, que passou a trazer `andre-marinho` (SQ 190002537524)
depois daquela execução. Ou seja, das 2 que fecham, 1 é ganho desta correção e a
outra é dado novo do TSE.

### Quem fecha

| slug | rota | evidência |
|---|---|---|
| `alex-pucineli` | `sq` | `consulta_cand_2012`, SQ 110000010149. **Só fecha por causa desta correção** |
| `andre-marinho` | `sq` | `consulta_cand_2026`, SQ 190002537524. Já fechava antes |

### Quem continua aberta, e por quê

**1 tem SQ que casa, mas o TSE não publica CPF na linha.**

- `santiago-belizario`: o SQ 180001905702 do seed casa com a linha
  `JOSE SANTIAGO BELIZARIO`, PREFEITO, PI, no `consulta_cand_2024`. O campo
  `NR_CPF_CANDIDATO` dessa linha é `-4`, marcador de não divulgado. Não existe
  CPF na fonte para recuperar, e nenhum padding deveria inventá-lo.

**1 casou só por nome mais nascimento, e essa rota não persiste por decisão de
identidade.**

- `renan-santos`: casou em 2026 (`RENAN ANTONIO FERREIRA DOS SANTOS`, SQ
  280002540694). A rota 2 nunca persiste sozinha por causa do precedente
  `jarbas-soares`, em que a data de nascimento do banco tinha proveniência TSE e
  o dado errado confirmava o dado errado. Fica para revisão humana.

**5 não têm SQ em ano nenhum varrido, têm data de nascimento, e a chave nome
mais nascimento não achou linha em 2010 a 2026.**

`augusto-cury`, `jarbas-soares`, `natasha-slhessarenko`, `rafaell-milas`,
`ricardo-cappelli`.

**21 não têm SQ em ano nenhum varrido nem data de nascimento no banco, então não
existe rota exata para elas.**

`andre-luis`, `ben-mendes`, `breno-barcelar`, `cadu-xavier`, `camila-falcao`,
`carlos-machado`, `dr-helton-monteiro`, `elisson-ferreira`, `eudo-raffael`,
`francisco-jurity`, `gisvaldo-oliveira`, `huggo-leonardo`, `jarir-pereira`,
`kiko-caputo`, `lais-chaud`, `luiz-franca`, `pedro-abib`, `renan-hallais`,
`renato-gomes`, `witer-naves`, `yuri-ezequiel`.

O gargalo real das 30, portanto, não é o defeito de formatação: é ausência de
`tse_sq_candidato` no seed, que atinge 27 delas. Fechar essas 27 é trabalho de
curadoria de identidade, não de coletor.

## Gates

| gate | resultado |
|---|---|
| `npm test` | exit 0, 2793 testes, 0 falhas |
| `npm run check:dead-code` | exit 0 |
| `npm run build` | exit 0 |

## Pendente de ato externo

Rodar o backfill em modo de aplicação é ato do Thiago. Nada nesta branch escreve
em banco.

```
npx tsx scripts/backfill-cpf-tse.ts --apply
```

Contagem exata que essa execução deve produzir, conferida no dry-run desta
sessão: **2 CPFs persistidos** em `candidatos.cpf` (`alex-pucineli` e
`andre-marinho`), fill-only, e **30 linhas em `coleta_log`** com fonte
`tse-cpf`: 2 `encontrado`, 1 `erro` de revisão humana (`renan-santos`) e 27
`vazio_confirmado`.

Depois disso, a lista de não consultáveis da varredura de sanções cai de 30 para
28.
