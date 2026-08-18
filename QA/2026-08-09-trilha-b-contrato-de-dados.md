# B-E2: contrato de dados da Trilha B para a Trilha C

Publicado em 09/08/2026 pela Trilha B, no branch `trilha-b`.
Fixtures: [`QA/contratos/trilha-b-fixtures.json`](contratos/trilha-b-fixtures.json).

A Trilha C desenvolve contra este documento **sem esperar aplicação nenhuma**.
Nada aqui depende de migration aplicada depois de 09/08: as formas descritas já
existem em produção, e o que muda com as coletas é o preenchimento, não o
formato.

## Regra que governa todas as tabelas abaixo

Lista vazia nunca significa "esta pessoa está limpa". Significa uma de seis
coisas, e quem separa não é a lista: é o campo de proveniência que a ficha já
carrega. Para sanções ele chega na C como
`FichaCandidato.sancoes_verificacao` (interface `SancoesVerificacao`:
`{resultado, executado_em}`), para processos como `processos_verificacao`,
mesma forma. `null` é o sexto estado, nunca verificado. A view
`coleta_log_ultima` é o mecanismo por trás; a C consome o campo, não a view:

| Estado | Fecha cobertura? | O que a superfície pode dizer |
|---|---|---|
| `encontrado` | sim | o achado |
| `vazio_confirmado` | sim | "consultado, nada encontrado", com fonte e data |
| `nao_aplicavel` | sim | por que não se aplica |
| `sem_achado_no_escopo` | **não** | "curadoria limitada", nunca ausência |
| `indeterminado` | **não** | "não foi possível verificar" |
| `erro` | **não** | "não foi possível verificar", com o motivo |
| ausência de linha | **não** | "ainda não verificado" |

Os três de baixo mais a ausência somam a maioria dos casos hoje. Tratar
qualquer um deles como `vazio_confirmado` é o defeito que o `coleta_log` foi
criado para impedir.

## 1. Sanções (`sancoes_administrativas`)

O que a C consome: `FichaCandidato.sancoes_administrativas`, tipado como
`SancaoAdministrativa[]` (`src/lib/types.ts`), e no DTO público a forma de
`publicSancao()` (id compacto, sem `candidato_id` e sem `cnpj_empresa`,
`descricao` e `fundamentacao` mascaradas). A tabela tem colunas a mais (`ativo`,
`numero_processo`, `fonte`) que **não estão no tipo nem no DTO**: não construa
nada sobre elas. Fixtures nas duas formas.

**1.1. Vigência deriva de `data_fim`, não de um campo `ativo`.** O coletor
mantém um `ativo` interno, mas ele não chega na C. A regra observável é a mesma
que o coletor usa: `data_fim` nula é sanção sem término no cadastro (CEAF nunca
tem), `data_fim` no passado é expirada, e expirada **continua na lista**. Um
destaque que somasse a lista inteira anunciaria como vigente o que já acabou.

**1.2. Só existe `vinculo: "direto"`.** O CEPIM saiu do pipeline em 04/08 (só
filtra por CNPJ, e o CPF de um candidato nunca casaria), então
`empresa_associada` não é produzido por coleta nenhuma. Não construa filtro por
vínculo esperando dois valores.

**1.3. O desfecho passou a existir por cadastro.** Antes, qualquer falha fechava
o candidato inteiro em `erro`, e isso não distinguia "o CEAF caiu" de "os três
caem sempre". A coleta agora devolve `porCadastro: [{tipo, resultado, volume}]`
com CEIS, CNEP e CEAF separados. `coleta_log` continua gravando **uma** linha
agregada por candidato; o detalhe por cadastro está no relatório de dry-run.

**1.4. Resposta com registros que não casam com o CPF é `indeterminado`, nunca
vazio.** O cenário é indistinguível do incidente de 04/08 (a API ignora o filtro
em silêncio e devolve a lista nacional), então um cadastro que devolveu só
registro de outra pessoa fecha em `indeterminado`, e o agregado do candidato
também: `indeterminado` vence `encontrado` pela mesma regra que já fazia falha
de cadastro vencer. Para a Trilha C isso significa que
`sancoes_verificacao.resultado` pode vir `"indeterminado"`, e a superfície trata
igual a `erro`: "não foi possível verificar", nunca ficha limpa.

## 2. Pontos de atenção (`pontos_atencao`) — leia antes de planejar destaques

**Sanção não gera ponto de atenção hoje, e não vai gerar durante o lançamento.**

O coletor monta a linha, e então o guard `motivoRecusaDeFonte()` a recusa: a
gravidade é `alta` e não há `fontes`, porque a rota consultada é a API
autenticada do Portal e a fonte exibível teria que ser a página pública
equivalente, que o coletor não tem. O gate de produção (`20260725160000`)
recusaria o INSERT de qualquer jeito; o coletor só para antes, com aviso.

Consequência direta para os itens 4 e 14 (destaques vazios): **rodar a coleta de
sanções não vai encher destaque nenhum por esse caminho.** Um candidato pode
terminar com duas sanções em `sancoes_administrativas` e zero pontos de atenção.
Se a Trilha C planejava contar com sanção alimentando destaque, o plano precisa
mudar agora, não na integração.

Para religar seria preciso anexar a URL pública do Portal em `fontes`. É
trabalho de coletor (Trilha B), não de superfície, e está fora do escopo desta
trilha para o lançamento.

## 3. Processos judiciais (`processos`)

**Não existe coletor automático.** Nenhum script de `scripts/` escreve em
`processos`; `src/lib/api.ts` só lê. O acervo vem de curadoria
(`scripts/curadoria-processos-lote.ts`, fonte `processos-curadoria`), que
consulta DJEN/PJe por nome e só aceita a ocorrência quando a própria comunicação
traz contexto político compatível, e depois cruza no DataJud pelos números CNJ.

Classificação daquele lote: `encontrado`, `vazio_confirmado`, `bloqueado`.
**`bloqueado` é identidade insuficiente**, e na leitura pública traduz para
`indeterminado`, nunca para vazio. Um homônimo aceito aqui é acusação contra
pessoa real.

## 4. Patrimônio: o terceiro estado é obrigatório

`patrimonio` (uma linha por candidato e ano) mais
`patrimonio_ausencia_oficial` (migration `20260807181000`, **aplicada em
produção em 07/08**).

**Como o terceiro estado chega na C, de verdade:** não é lendo a tabela. A ficha
já entrega `patrimonio_eleicoes: PatrimonioEleicaoPublico[]`, montado por
`buildPatrimonioEleicoes()` (`src/lib/public-profile-dto.ts`), uma linha por ano
aplicável, com três estados fechados:

| `estado` na linha de `patrimonio_eleicoes` | O que significa | O que exibir |
|---|---|---|
| `publicado` | existe linha em `patrimonio` para o ano | os bens |
| `vazio_confirmado` | o pacote oficial do TSE não traz bens para o SQ naquele ano (vem de `patrimonio_ausencia_oficial`), com `fonte_url` e `verificado_em` | "não declarou bens ao TSE", com fonte e data |
| `nao_coletado` | lacuna de coleta | "ainda não verificado" |

O tipo consumido de `patrimonio_ausencia_oficial` é `PatrimonioAusenciaOficial`
(`{ano_eleicao, fonte_url, verificado_em}`, já filtrado por candidato). Nunca
`R$ 0` para vazio nem para não coletado: zero é uma declaração, e a ausência não
é.

Isto vale para a Trilha D também (itens 11 e 17L, card de patrimônio): a área
vazia do card provavelmente é este estado sem renderização própria, e não um
dado que uma coleta vai preencher. Ver o relatório de dry-run para os casos
nominais.

## 5. O que a Trilha B ainda pode mudar, e o que já está congelado

**Congelado** (pode codar contra, não muda até o lançamento): todas as formas
acima, o vocabulário de estados terminais, e a regra de que `pontos_atencao` não
recebe sanção.

**Ainda pode mudar**: o volume preenchido em cada tabela, que depende de quais
atos a Sessão Raiz autorizar. Nenhuma mudança de **forma** está prevista.

**Não vai existir para o lançamento**: `vinculo: "empresa_associada"`, ponto de
atenção derivado de sanção, e coletor automático de processos judiciais.
