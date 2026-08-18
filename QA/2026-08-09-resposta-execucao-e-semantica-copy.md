# Execução autorizada de 09/08 (noite) e a semântica do copy de verificação

## O que rodou, tudo com readback de produção

- **Migration `20260809060000` aplicada** pelo caminho canônico: sonda de canal,
  dry-run completo em `BEGIN … ROLLBACK` com gate fail-closed, depois DDL e
  linha do ledger na MESMA transação. Ledger de 370 para 371, `ledger-guard`
  verde: "ledger e repositório contam a mesma história".
- **Os 12 confirmados escritos** via escrita auditada
  (`scripts/materializar-etapa9-tse-12.ts`, dry-run conferido antes): 12 de 12,
  trilha em `coleta_log` reconciliada nos dois sentidos, zero divergência.
- **Cache invalidado** (workflow `revalidate-cache.yml`, run 31335012032) e as
  **83 fichas relidas em público, zero falhas**: os 12 (Eduardo Paes, Sergio
  Moro, Felicio Ramuth que era o mais defasado desde 14/04, e mais 9) mostram
  **"Perfil verificado em 08/08/2026 (TSE candidaturas 2026)"** com status
  `current`; os outros 71 intactos. Evidência:
  `output/pf-reverificacao-20260809/etapa-11-readback.json`; recibo completo:
  `QA/2026-08-09-aplicacao-20260809060000-e-etapas-9-12.md`.
- **Placar de agosto: 111/194 antes, 123/194 agora.**
- Off-by-one anotado com chip de correção: gravei `2026-08-09`, o site exibe
  08/08 porque o leitor converte data de calendário por UTC e formata em
  America/Sao_Paulo. O 08/08 coincide com a data do snapshot do TSE, então a
  superfície não mente, mas é defeito real de exibição.
- **Recheque dos 43 (Augusto Cury incluído) agendado para 16/08 às 09:00**
  (scheduled task `recheque-tse-43-pf`), após a janela do TSE fechar em 15/08
  às 19h.

## O que "Perfil verificado em X (Perfil factual curado)" quer dizer

Tua interpretação ("última vez que qualquer atualização foi feita no perfil")
**não é** o que a data significa, e o erro vai nos dois sentidos:

1. **O box cobre só o bloco "Perfil atual"** (identidade, candidatura, redes),
   não a ficha inteira. Patrimônio, votos, projetos e financiamento têm frescor
   próprio, exibido em cada seção. Vários dos 83 receberam atualizações de
   patrimônio e financiamento em 07/08 sem que essa data mudasse: o perfil
   estava MENOS defasado do que o box sugeria nas outras abas.
2. **"Perfil factual curado" é o fallback**: a última vez que uma verificação de
   curadoria cobriu o perfil por inteiro (`ultima_atualizacao` no banco). Ela só
   anda quando alguém re-verifica os fatos do perfil, não quando qualquer campo
   muda. Por isso o 09/06 do Augusto Cury: a última curadoria completa dele foi
   em junho. Nisso a tua leitura de "estamos defasados" estava certa: era
   exatamente o gap real que motivou o dia.
3. **Desde hoje existe o segundo modo**, o que os 12 exibem: com as três frentes
   TSE (registro, situação da candidatura, redes declaradas) verificadas por SQ,
   o box mostra a data TSE com fonte nomeada, avançando pela mais antiga das
   três, nunca por verificação parcial.

Observação de copy: "Perfil factual curado" não explica nada para o visitante.
Se quiser, dá para trocar por algo como "verificação editorial completa" vs
"confirmado no TSE" numa próxima rodada; decisão de copy é tua, não mexi.

## Pendente para teus atos futuros

- 12 `revisao_identidade` (Zema, Tarcísio etc.) esperando confirmação por chave
  independente.
- 43 `nao_localizado` no recheque de 16/08.
- Commit do script da etapa 9 e dos recibos de QA (ato teu, via branch).
