# Publicação autônoma por cascata: regra e critério de aceite

Escrito em 22/09/2026, **antes de amostrar, rotular e rodar** os conjuntos da
cascata. Substitui a revisão humana item a item por verificação automática em
camadas, fechada por padrão: o par que não passa em todas as camadas não
aparece; ninguém precisa decidir sobre ele.

## Universo

Pares que o Jev v1 (ver `LIMIARES.md`) não descartou e pré-rotulou como
`relacionada` ou `sustenta`. Pares pré-rotulados `contradiz` ou
`nao_relacionada` nunca são publicados por esta via.

## Camadas (todas precisam passar)

1. **Código.** Proposição que é ato simbólico (denominação de via ou prédio,
   data ou semana comemorativa, título honorífico, homenagem) é bloqueada por
   regra sobre a ementa.
2. **Jev v1**, já rodado: pré-rótulo `relacionada` ou `sustenta`.
3. **Jev, segunda request** (`perguntas-cascata-v1.json`), Nouls decompostos:
   a evidência trata do objeto concreto que o título do tema nomeia; é ato
   simbólico; a ligação exige explicação externa. Os cortes são ajustados no
   conjunto de ajuste (no máximo 3 iterações) e congelados antes do holdout.
4. **Verificador independente de outra família de modelo** (Codex, sem ver as
   respostas do Jev, sem ferramentas nem web), em lote: responde `sim`, `nao`
   ou `incerto` para "a evidência trata do mesmo assunto do tema" e se é ato
   simbólico. Só `sim` e não simbólico passa.

O que passa é gravado com relação `relacionada` e exibido como "Trata do tema".
Direção (a favor ou contra) nunca é publicada por esta via.

## Conjuntos

- Ajuste da cascata: 30 pares do universo, fora do golden original.
- Holdout da cascata: 40 pares do universo, fora do golden original e do ajuste.
- Rótulo pela rubrica de `LIMIARES.md`, feito às cegas (sem ver probabilidades do
  Jev nem resposta do verificador), commitado antes da primeira rodada.

## Critério de aceite no holdout da cascata

1. **Precisão (prioritário).** Nenhum par publicado pode ter rótulo
   `nao_relacionada`.
2. **Utilidade.** A cascata publica ao menos 25% dos pares do holdout rotulados
   `relacionada`, `sustenta` ou `contradiz`.

Resultado:

- 1 e 2 atingidos: a publicação autônoma pode ser ligada.
- 1 falha: nada é publicado automaticamente.
- 2 falha com 1 atingido: pode ser ligada, e o relatório registra a cobertura baixa.

Depois de ligada, cada execução grava uma amostra dos publicados no log de
auditoria, e há um comando que despublica de uma vez tudo o que veio da cascata.
