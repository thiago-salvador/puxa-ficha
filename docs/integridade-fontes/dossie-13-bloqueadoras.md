# Dossiê das claims que bloqueiam o lançamento

## Correção de escopo (2026-08-02, decisão do Thiago)

A regra é: **só entra no escopo candidato que realmente está na disputa.** Aplicada
contra o campo `status` de `candidatos`, ela derruba o problema de 13 para **3**.

Das 13 que passam o gate de leitura com 100% das fontes mortas, **10 são de pessoas
fora da disputa**:

| Pessoa | `status` | Claims entre as 13 |
|---|---|---|
| Jair Bolsonaro | `removido` | 3 (2 críticas, 1 alta) |
| Tarcísio de Freitas | `removido` | 2 (1 crítica, 1 alta) |
| Michelle Bolsonaro | `removido` | 1 (crítica) |
| Haddad | `removido` | 1 (alta) |
| Pablo Marçal | `removido` | 1 (alta) |
| Eduardo Leite | `desistente`, `cargo_disputado: Nenhum` | 2 (altas) |

**Consequência das duas: sobram 3 claims, todas de gravidade `alta`, e nenhuma
`crítica`.** Todo o bloco crítico do lançamento era de gente que não está concorrendo.

Backlog inteiro sob a mesma regra: 42 claims com defeito real de fonte (não 62), sendo
32 de reancoragem e 10 de despublicação, distribuídas em 34 `baixa`, 5 `media`, 3 `alta`
e **zero `crítica`**.

---

## As 3 que de fato bloqueiam

Método: nenhuma URL entra aqui sem passar por `scripts/probe-urls-offline.ts`, que usa o
`probeUrlReal` do próprio link-check. Todas as substitutas abaixo estão **`viva`, HTTP 200**.

### 1. Ciro Gomes, "Agressão a jornalista durante campanha" (alta)

- **Fonte atual:** `g1.globo.com/politica/eleicoes/2022/noticia/2022/09/01/ciro-gomes-...` → **404**, sem snapshot.
- **Substitutas verificadas (`viva`):**
  - https://www.poder360.com.br/eleicoes/abraji-diz-que-ciro-contribuiu-para-violencia-contra-jornalistas/
  - https://www.poder360.com.br/eleicoes/jornalista-xingado-por-ciro-gomes-pretende-registrar-ocorrencia/
- **Alerta sobre o texto:** "agressão" é forte demais para o que as fontes sustentam. A
  Abraji e outras 8 entidades falam em postura "agressiva e desrespeitosa" que
  **estimula** violência contra jornalistas, e há registro de jornalista xingado. Isso não
  é o mesmo que agressão física. O título precisa ser ajustado ao que a fonte diz.

### 2. Ciro Gomes, "Não apoiou Lula no 2º turno de 2018 e 2022" (alta)

- **Fonte atual:** `www1.folha.uol.com.br/poder/2018/10/ciro-viaja-para-paris-e-nao-declar...` → **404**, sem snapshot.
- **Substituta:** ainda não localizada com verificação. É fato político amplamente
  documentado, então deve ser fácil, mas não vou registrar URL sem probe verde.
- **Alerta sobre a classificação:** posicionamento eleitoral não parece caber em
  gravidade `alta`. É informação de trajetória política, não conduta. Vale revisar a
  gravidade junto com a fonte.

### 3. Aldo Rebelo, "De comunista a aliado de Bolsonaro" (alta)

- **Fonte atual:** `www1.folha.uol.com.br/poder/2022/aldo-rebelo-bolsonaro.shtml` → **404**,
  sem snapshot, e com estrutura de URL que não corresponde ao padrão da Folha.
- **Substituta verificada (`viva`):**
  - https://www.poder360.com.br/poder-gente/saiba-quem-e-aldo-rebelo-ex-ministro-da-defesa/
- **Alerta sobre a classificação:** mesma questão do item 2. Mudança de alinhamento
  político ao longo da carreira é trajetória, não conduta reprovável. A fonte sustenta o
  fato (aproximação com a ala militar e elogio público de Bolsonaro em novembro de 2024),
  mas gravidade `alta` para isso parece desproporcional.

---

## Padrão que atravessa as 3

Nas 3, a fonte morta é só metade do problema. Em uma, o verbo do título ultrapassa o que
a fonte sustenta; nas outras duas, a gravidade atribuída parece desproporcional ao fato.
Nenhuma dessas correções é técnica: são decisões editoriais, e por isso nada foi aplicado.

## O que fazer com as 10 fora de escopo

Elas não vão ao ar enquanto o candidato estiver `removido` ou `desistente`, então não
bloqueiam nada. Mas continuam `visivel = true` no banco, prontas para reaparecer se
alguém voltar à coorte. Duas saídas, e ambas são decisão tua: despublicar agora, ou
deixar e tratar a revalidação de fonte como parte obrigatória de qualquer volta de
candidato à coorte publicada.
