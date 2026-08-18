# Patrimônio do Cabo Daciolo em 2006 e 2008

Sessão de criação e prova local, branch `rc-daciolo-2006-2008`, nascida de
`rc-lancamento` em `aa40b68`. **Nada foi aplicado em produção.** Leitura do
Supabase, sim; escrita, nenhuma. Toda a prova de comportamento rodou em
Postgres 17 efêmero em Docker.

Fecha o item 6 da nota PF Ajustes na parte de dados. A verificação de entrada é
o R1 de 10/08/2026, feito contra os pacotes oficiais do TSE, e cada afirmação
dele foi reconferida contra o banco antes de uma linha de SQL ser escrita.

---

## 1. O antes, medido e não suposto

Lido do Supabase em 10/08/2026, ficha `cabo-daciolo`
(`b1104f0b-80fb-4082-8356-dfb374e20028`, publicável), rodando o
`buildPatrimonioEleicoes` real de `src/lib/public-profile-dto.ts` sobre os dados
reais:

```
2022 -> publicado
2018 -> vazio_confirmado   bem_candidato_2018.zip, verificado em 2026-08-07
2014 -> publicado
2008 -> nao_coletado
2006 -> nao_coletado
```

Linhas por tabela, antes:

| Tabela | Estado do `cabo-daciolo` |
|---|---|
| `historico_politico` | 7 linhas, entre elas 2006 (Dep. Estadual RJ/PRTB, `tse`) e 2008 (Vereador RJ/PRB, `tse`) |
| `patrimonio` | 2 linhas: 2014 (R$ 40.000,00) e 2022 (R$ 64.650,00) |
| `patrimonio_ausencia_oficial` | 1 linha: 2018, SQ 280000602500 |
| `data/candidatos.json` → `ids.tse_sq_candidato` | só `2018` e `2022` |

Uma medição colateral que decide o desenho: **a base inteira não tinha nenhuma
linha de `patrimonio` com `valor_total = 0`.** A de 2006 é a primeira, e é assim
de propósito.

Nada divergiu do R1. A premissa da Trilha B ("2006 e 2008 não existem como
candidatura") continua errada pelo mesmo motivo que o R1 apontou: as duas
candidaturas existem, o que faltava era o dado de bens, e a causa da não-coleta
era o SQ ausente no seed.

## 2. A evidência oficial, resumida

| Ano | O que a fonte diz | Onde |
|---|---|---|
| 2006 | Dep. Estadual RJ, PRTB, SQ **12132**, suplente, deferido. O pacote de bens **traz 1 registro**: "Nenhum bem a declarar", R$ 0,00 | `bem_candidato_2006.zip` (29 CSVs, 164.722 linhas), filtro SQ 12132 **e** UF RJ; confirmado em DivulgaCandContas (`buscar/2006/RJ/14423/candidato/12132`) |
| 2008 | Vereador no Rio, PRB, SQ **14144**, suplente, deferido, `ST_DECLARAR_BENS = "N"`. O pacote de bens traz **zero linhas** | `bem_candidato_2008.zip` (27 CSVs, 1.582.638 linhas), filtro SQ 14144 **e** UF RJ; confirmado em DivulgaCandContas (`buscar/2008/60011/14422/candidato/14144`, `bens: []`) |

Âncora de identidade: CPF [CPF removido deste arquivo em 17/08/2026 (dado pessoal em espelho publico)] e título [titulo de eleitor removido deste arquivo em 17/08/2026 (dado pessoal em espelho publico)], idênticos em 2006,
2008 e 2018. Nome civil **Benevenuto Daciolo Fonseca dos Santos**.

O filtro de UF é obrigatório: o `SQ_CANDIDATO` anterior a 2010 é sequencial
**por UF** e colide entre estados. Sem ele, 2006 casa 4 linhas (2 dele no RJ, 2
de outra pessoa em SP) e 2008 casa 40 linhas em BA, RS e outros estados,
nenhuma dele.

## 3. O achado do contrato de exibição

**O contrato existente dá conta da diferença, e não precisou mudar. Mas ele só
dá conta porque a migration escolhe a tabela certa, e escolher errado produz uma
frase falsa na tela.**

`patrimonio_ausencia_oficial` produz o estado `vazio_confirmado` em
`buildPatrimonioEleicoes`, e `CandidatoProfileSections.tsx` escreve, literalmente:

> Sem bens declarados ao TSE em {ano}. O pacote oficial de bens desta eleição foi
> conferido e não traz registros para este candidato.

Para 2008 a frase é verdadeira. **Para 2006 seria falsa**: o pacote traz um
registro, e o registro diz que não há bens. Registrar 2006 como ausência seria a
superfície afirmando sobre a fonte o oposto do que a fonte diz.

Por isso:

- **2006 entra em `patrimonio`**, valor `0.00`, com o bem literal do TSE dentro.
  Vira estado `publicado`, e a tela mostra um card "2006 / R$ 0" que abre no bem
  "Outros bens e direitos — Nenhum bem a declarar — R$ 0".
- **2008 entra em `patrimonio_ausencia_oficial`**, com fonte e data. Vira
  `vazio_confirmado`, e a frase acima passa a ser literalmente verdadeira.

Nenhuma linha de `src/lib/public-profile-dto.ts` nem de
`src/components/CandidatoProfile.tsx` foi tocada. **Zero conflito com a sessão
que está mexendo nesses dois arquivos.**

A prova disso é um teste que monta o modelamento ERRADO de propósito (2006 sem
linha em `patrimonio` e com linha de ausência) e mostra a frase falsa aparecendo
na tela renderizada, e a declaração real sumindo. Está em
`tests/daciolo-patrimonio-2006-2008-migration.test.tsx`, último caso.

### Efeito colateral medido, e é decisão de produto

`getPatrimonioSummary` em `src/components/ProfileOverview.tsx` só calcula
crescimento quando `earliest.valor_total > 0`. Com 2006 publicado, a declaração
mais antiga passa a ser R$ 0 e o indicador some. Medido renderizando o
componente real:

```
antes:  ↑ 62% desde 2014
depois: <nenhum>
```

Não é regressão de verdade: crescimento percentual a partir de zero é
indefinido, e inventar um número ali seria pior. Mas é uma linha que some da
ficha, e quem decide se a régua de crescimento deve passar a ignorar declarações
de zero é a Raiz, não esta sessão. Não mexi nisso.

## 4. O que foi escrito

**Uma migration só**, e a razão é que os dois atos são uma decisão editorial
única: eles só estão certos um em relação ao outro. Numa transação só, o guard
consegue exigir o invariante cruzado (2006 nunca como ausência, 2008 nunca como
patrimônio) antes e depois da escrita. Separados em dois arquivos, metade poderia
aplicar sozinha e deixar a ficha num estado que ninguém conferiu.

| Arquivo | O que faz |
|---|---|
| `supabase/migrations/20260810094000_daciolo_patrimonio_2006_2008.sql` | 2 escritas: `patrimonio` 2006 (R$ 0,00 + bem literal) e `patrimonio_ausencia_oficial` 2008 (SQ 14144, fonte, data) |
| `supabase/rollback/20260810094000_daciolo_patrimonio_2006_2008.rollback.sql` | remove as duas, e só se ainda estiverem exatamente como a forward deixou |
| `scripts/audit/allowlist-daciolo-patrimonio-20260810.json` | autoriza os dois pares `(tabela, slug, ano, campos)`, com `max_registros: 1` cada |
| `scripts/audit/recortes-daciolo.proposta.json` | proposta de recorte para a Raiz integrar. **`recortes.json` não foi tocado** |
| `scripts/audit/provar-migration-daciolo.sh` | prova executável, 9 ramos, Postgres 17 efêmero |
| `tests/daciolo-patrimonio-2006-2008-migration.test.tsx` | 13 casos: gate, classificação, seed, DTO e exibição |
| `data/candidatos.json` | `ids.tse_sq_candidato` do `cabo-daciolo` ganha `"2006": "12132"` e `"2008": "14144"` |

**O terceiro ato do R1 não é migration.** `ids.tse_sq_candidato` não existe no
banco: mora só no seed. Então ele é edição de arquivo do repositório, vai no
mesmo commit, e está coberto por teste.

### Guards, e por que nenhum é `NOT EXISTS`

O padrão `NOT EXISTS` das migrations de 20260807 transforma alvo divergente em
no-op bem-sucedido, e no-op bem-sucedido grava a versão no ledger dizendo que o
dado entrou quando ele não entrou. Aqui toda pré-condição **aborta**:

1. ficha `cabo-daciolo` com cardinalidade exatamente 1;
2. candidatura de 2006 (Dep. Estadual, `tse`) com cardinalidade 1;
3. candidatura de 2008 (Vereador, `tse`) com cardinalidade 1;
4. 2006 sem patrimônio prévio, e 2008 sem ausência prévia;
5. **cruzamento invertido**: 2006 não pode estar como ausência, 2008 não pode
   estar como patrimônio. Se estiver, a migration nomeia a divergência e para,
   porque sobrescrever em silêncio esconderia exatamente o erro que ela existe
   para não cometer;
6. pós-condição de conteúdo: valor 0 **e** bem "Nenhum bem a declarar". Contagem
   sozinha não basta, porque linha de zero sem o bem dentro vira, na tela, um
   card de R$ 0 que não diz o que a fonte disse;
7. pós-condição de não-dano: 2014, 2022 e a ausência de 2018 intactos.

Consequência deliberada: a migration **falha no replay linear em banco vazio**,
igual à 20260809070000 e à 20260810085000. Isso foi **medido**, não previsto:
`replay-migrations.sh linear --tolerante` devolve
`ERROR: daciolo patrimonio 2006/2008: ficha cabo-daciolo com cardinalidade 0`.
Registrada em `scripts/audit/falhas-replay-linear.json` e em
`scripts/audit/quebras-previstas.json`.

## 5. A prova em Postgres 17 efêmero

`npm run audit:daciolo:provar` (`scripts/audit/provar-migration-daciolo.sh`),
imagem `postgres:17` presa a digest. **Nove ramos, todos como esperado, exit 0.**

```
== forward
  PASS  F0 abortou em base vazia                       (cardinalidade 0, nada criado)
  PASS  F1 abortou por candidatura de 2006 ausente
  PASS  F2 abortou por candidatura de 2008 ausente     (2006 não entrou pela metade)
  PASS  F3 abortou diante de patrimonio ja existente   (curadoria anterior intacta)
  PASS  F4 abortou diante de ausencia ja registrada    (SQ anterior intacto)
  PASS  F5 abortou com 2006 classificado como ausencia (cruzamento invertido)
  PASS  F6 rc (0)
  PASS  F6 2006 valor (0.00)
  PASS  F6 2006 bem literal do TSE (Nenhum bem a declarar)
  PASS  F6 2006 fora da tabela de ausencia (0)
  PASS  F6 2008 SQ da ausencia (14144)
  PASS  F6 2008 fora da tabela de patrimonio (0)
  PASS  F6 2014 intacto (40000.00) / 2022 intacto (64650.00) / 2018 intacto
== rollback
  PASS  R1 patrimonio 2006 removido, ausencia 2008 removida, 2014/2022/2018 intactos
  PASS  R2 abortou diante de curadoria posterior em 2006
  PASS  R2 valor novo preservado (7500.00)

OK: 9 ramos, todos como esperado.
```

**A prova foi verificada VERMELHA contra uma mutação.** Afrouxei a guarda do
rollback (removi a exigência de que 2006 estivesse com valor 0 e o bem literal) e
rodei de novo: R2 passou a destruir o valor curado depois, e o harness saiu com
3 falhas. Harness que só fica verde não prova nada; este morde.

## 6. O depois

Estado seedado com as linhas reais de produção no Postgres efêmero, migration
aplicada de verdade, e `buildPatrimonioEleicoes` rodado sobre o que saiu do banco:

| Ano | Antes | Depois |
|---|---|---|
| 2022 | publicado | publicado |
| 2018 | vazio_confirmado | vazio_confirmado (intacto) |
| 2014 | publicado | publicado |
| **2008** | **nao_coletado** | **vazio_confirmado**, fonte `bem_candidato_2008.zip`, verificado em 10/08/2026 |
| **2006** | **nao_coletado** | **publicado**, R$ 0,00, bem "Nenhum bem a declarar" |

Nenhum ano do Daciolo sobra como `nao_coletado`. A ficha deixa de dizer "a coleta
de bens da eleição de 2006/2008 ainda não foi realizada", e passa a dizer, em
2006, o que o TSE registrou, e em 2008, que o TSE não tem registro.

## 7. Gates

| Gate | Exit | Observação |
|---|---|---|
| `npm test` | **1** | 2793 de 2794. A ÚNICA falha é `recortes.json cobre a árvore de migrations de hoje`, que é o acoplamento com a Raiz |
| `npm test` com o recorte integrado | **0** | 2794 de 2794. Medido integrando a proposta localmente e revertendo em seguida |
| `npm run check:dead-code` | **0** | |
| `npm run build` | **0** | |
| `npm run validate:seed` | **0** | 271 candidatos |
| recorte, três flags juntas | **0** | `--allowlist=scripts/audit/allowlist-daciolo-patrimonio-20260810.json --desde=20260810094000 --ate=20260810094000` |
| `npm run audit:cobertura:allowlist` **sem flags** | **1** | esperado, ver abaixo |
| `npm run audit:daciolo:provar` | **0** | 9 ramos |

O gate pelado reprova com exatamente duas linhas, e as duas são a mesma coisa:

```
FAIL allowlist scripts/audit/allowlist-daciolo-patrimonio-20260810.json não é
     referenciada por recorte nenhum.
FAIL 20260810094000_daciolo_patrimonio_2006_2008.sql: tem anotação @write e não
     cai em recorte nenhum de recortes.json.
```

Isso é o esperado enquanto a Raiz não integrar
`scripts/audit/recortes-daciolo.proposta.json`. **Não se conserta editando
`recortes.json`**, que é propriedade da Raiz. Para dar certeza à Raiz de que a
integração basta, simulei a integração localmente: o gate pelado saiu **exit 0** e
a suíte inteira saiu **exit 0**, e depois `recortes.json` foi devolvido ao estado
de `aa40b68` sem uma linha de diferença.

## 8. Dois achados que não são meus para consertar

### 8.1 O manifesto de replay já estava um número fora do lugar, e não por minha causa

Rodei o replay linear real. A medição de hoje, com a minha migration incluída, é
**292 aplicadas e 90 falhas**, e o diretório tem 382 arquivos. O manifesto dizia
**293 e 88** para 381 arquivos.

A conta não fecha por uma migration, e ela não é minha:
`20260810090100_despublicar_votacoes_chave_defeituosas.sql`, da sessão de
votações, **falha no replay linear** (`pre-condicao: votacao
86e0edac-52a5-44fe-b699-1c09aaf42a32 nao existe`) e está contada como aplicada.

O que eu fiz: acrescentei **só a minha** entrada às `falhas` (88 → 89),
mantendo `aplicadas_esperadas: 293`. A soma fecha com o diretório (293 + 89 =
382) e a suíte passa. O que eu **não** fiz: corrigir 293 para 292, porque isso
seria absorver no meu commit a correção de uma migration de outra sessão.

E ainda bem, porque a Raiz **já corrigiu isso no RC**, depois do `aa40b68` que é
a base desta branch: o log de 16:30 registra a mesma remedição, 292 aplicadas e
89 falhas, com a mesma causa (a 20260810090100 aborta de propósito). Como a
minha edição não encosta na linha de `aplicadas_esperadas`, o merge resolve
sozinho para o valor da Raiz, e a conservação fecha em **292 + 90 = 382**.

Fica só o registro de que a divergência foi medida aqui de forma independente,
contra `aa40b68`:

```
falhou de verdade e não estava no manifesto do aa40b68:
  20260810090100_despublicar_votacoes_chave_defeituosas.sql
  20260810094000_daciolo_patrimonio_2006_2008.sql  (esta sessão)
```

### 8.2 O SQ pré-2010 no seed exigiu correção fail-closed no RC

A branch desta trilha identificou que `entry.estado` vazio fazia o coletor
pré-2010 pular o filtro de UF. A integração corrigiu o caminho comum em
`scripts/gerar-backfill-patrimonio-tse.ts`: a UF da candidatura por ano
(`ids.tse_uf_candidatura`) vence a UF atual, e ausência das duas agora é recusa,
nunca casamento livre por SQ.

`tests/backfill-patrimonio-uf-fail-closed.test.ts` cobre o SQ `14144` do
`cabo-daciolo`, a colisão em outra UF e o caso sem UF. Assim, uma futura rodada
não pode publicar as 40 linhas de BA, RS e outros estados como sendo dele.

## 9. O ato externo pendente

Um só: **aplicar a migration em produção**, o que esta sessão está proibida de
fazer. Contagem exata do que ela escreve:

| Tabela | Linhas inseridas | Linhas alteradas | Linhas removidas |
|---|---|---|---|
| `patrimonio` | **1** (cabo-daciolo, 2006, `valor_total` 0.00, 1 bem) | 0 | 0 |
| `patrimonio_ausencia_oficial` | **1** (cabo-daciolo, 2008, SQ 14144) | 0 | 0 |
| `historico_politico` | 0 | 0 | 0 |
| `candidatos` | 0 | 0 | 0 |
| **total no banco** | **2** | **0** | **0** |

Fora do banco, no mesmo commit: 2 chaves novas em `ids.tse_sq_candidato` do
`cabo-daciolo` em `data/candidatos.json`.

Antes disso, dois passos que não são meus:

1. a Raiz integra `scripts/audit/recortes-daciolo.proposta.json` em
   `scripts/audit/recortes.json` (a entrada fica depois de
   `votacoes-chave-v2-20260810`);
2. quem aplicar envolve a migration mais a linha do ledger numa transação
   externa única, como manda a 20260809070000.

Depois de aplicar, a ficha pública pode levar até uma hora para refletir: o
`unstable_cache` de `src/lib/api.ts` tem TTL de 3600s. `npm run cache:aquecer`
encurta isso.

## 10. Conflito potencial com as outras sessões

Arquivos meus, sem disputa: a migration, o rollback, a allowlist, a proposta de
recorte, o script de prova, o teste novo e este recibo.

Arquivos compartilhados que precisei tocar, todos com edição aditiva de uma
entrada só:

| Arquivo | O que acrescentei | Risco |
|---|---|---|
| `scripts/audit/quebras-previstas.json` | 1 nome no fim do array | baixo |
| `scripts/audit/falhas-replay-linear.json` | 1 nome no array `falhas` | baixo, mas ver 8.1 |
| `tests/candidatos-publico-view-contrato.test.ts` | 1 entrada em `POSTERIORES` | **médio**: as outras sessões acrescentam à mesma lista |
| `package.json` | 1 script `audit:daciolo:provar` | baixo |
| `data/candidatos.json` | 2 chaves no `cabo-daciolo` | baixo |

**Não toquei** em `scripts/audit/recortes.json`, em
`scripts/audit/baseline-escritas-sem-anotacao.json`, em
`src/components/CandidatoProfile.tsx` nem em `src/lib/public-profile-dto.ts`.
