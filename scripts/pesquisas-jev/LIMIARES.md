# Limiares fixados em 19/09/2026, ANTES de rodar o holdout

- `atribuicao` >= 0,80 -> aceita o par
- `atribuicao` <= 0,20 -> descarta o par
- entre 0,20 e 0,80 -> revisao humana, nunca decide sozinho
- `disputa_alvo` <= 0,20 -> exclui o par do cenario coletado
- Criterio de aceite do holdout: acuracia >= 0,90 em `atribuicao` na faixa
  decidida (fora da zona cinza) e zero falso positivo de `disputa_alvo`, isto e,
  nenhum par de outra disputa aceito como sendo a disputa alvo.
