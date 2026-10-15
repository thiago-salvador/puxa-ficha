# Coleta judicial por candidato no Mac

## Motivo e alcance

A API do DJEN (`comunicaapi.pje.jus.br`) responde HTTP 403 ao runner hospedado
do GitHub. A execução 36720206903 de `processos-coleta-judicial.yml` parou com
`fatal=bloqueio_http fonte=DJEN:inventario status=403`, antes de qualquer
escrita (issue #582). No Mac, a mesma API responde HTTP 200.

Por isso a coleta roda no agente launchd `scripts/processos-local/coletar-local.sh`,
segunda e quinta às 09:17 UTC (06:17 em Brasília), até 25/10/2026. O instalador
converte o horário para o fuso local. O workflow
`processos-coleta-judicial.yml` ficou só com a conferência dos recibos, às
12:17 UTC dos mesmos dias, sem consultar DJEN nem DataJud e sem gravar nada.

O agente usa a `main` fixada por SHA e confere a cópia instalada contra ela,
como os agentes de `scripts/checagens-local/` e `scripts/tse-local/`. Não
executa código de PR.

## Ordem da rodada

É a mesma sequência e são as mesmas travas do antigo passo de coleta do
workflow:

1. Busca a `main` pela URL explícita, confere o SHA com `ls-remote`, valida a
   cópia instalada e cria um worktree temporário nesse SHA.
2. Usa Node 24, `psql` do `libpq` do Homebrew e `npm ci --ignore-scripts`.
3. Confere os recibos antes (`processos-coverage-snapshot.sql` e
   `check-processos-receipts.ts`). Essa conferência é informativa, como o
   `continue-on-error` do workflow.
4. Para `vencendo` (margem de 5 dias) e `sem-recibo`, roda
   `curadoria-processos-lote.ts --coorte-atual --dry-run` com `PF_DRY_RUN=1`.
   A leitura das fontes nunca escreve no banco.
5. Só `aplicar-evidencia-processos-curadoria.ts --apply` grava, e só em
   `coleta_log`, com backup, preflight e readback. Nunca grava em `processos`.
6. Fonte oficial instável: cada fonte tem estado próprio, o DJEN recebe uma
   chamada por vez com 1 s de intervalo, e 429, 5xx, tempo esgotado ou rede
   ganham até 5 novas tentativas com backoff exponencial e jitter, dentro de
   um orçamento por execução. Se a fonte segue fora (três chamadas seguidas
   esgotadas ou orçamento no fim), a coleta para sem evidência e sem recibo
   `erro`: os recibos existentes ficam intactos e a próxima rodada tenta de
   novo. Interrupção por outra causa vira recibo `erro`, pelo
   `registrar-erro-coleta-processos.ts`, só para alvo sem recibo ou já em
   `erro`. Nenhum caminho rebaixa recibo válido para `erro`.
7. O diagnóstico saneado (`resumir-diagnostico-coleta-processos.ts`) fica em
   `diagnostico-publico/`.
8. Confere os recibos depois. Falha de coleta, do aplicador ou dessa
   conferência termina a rodada com erro no log. Sucesso termina com
   `COLETA_OK`.

Evidência, logs, backups do aplicador e resumo ficam em
`~/Library/Application Support/puxa-ficha/processos-local/<UTC>-<SHA>/`, com
permissão só do usuário. O log da rodada fica em
`~/Library/Logs/puxa-ficha/processos-local-<UTC>.log`. Nada vai para `/tmp` nem
para o repositório.

## Instalação após o merge do código

O instalador só aceita checkout limpo cujo HEAD seja a `main` remota atual.
Ele copia script e plist para o usuário, mas não carrega o agente.

```bash
mkdir -p ~/.config/puxa-ficha
chmod 700 ~/.config/puxa-ficha
touch ~/.config/puxa-ficha/processos-local.env
chmod 600 ~/.config/puxa-ficha/processos-local.env
bash scripts/processos-local/instalar-agente.sh
```

O arquivo de credenciais, fora do repositório, aceita apenas estas três
chaves, uma por linha, sem aspas nem `export`:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=...
```

A URL do banco chega ao `psql` por variáveis `PG*`, nunca pela linha de
comando. Antes de carregar, executar a prova sem credenciais e sem escrita no
banco:

```bash
bash ~/Library/Application\ Support/puxa-ficha/processos-coletar-local.sh <clone-principal> --verificar
```

O log deve terminar com `VERIFICACAO_OK`. A prova consulta o inventário de
tribunais do DJEN, que não tem dado nominal, e exige HTTP 200. Para uma rodada
completa sem gravar recibos, usar `--dry-run` no lugar de `--verificar`: ela lê
as credenciais e as fontes, e roda o aplicador em `--dry-run`.

Depois, carregar o plist instalado:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.com.puxaficha.processos-local.plist
```

Se o Mac estiver desligado, a rodada passa. O agente não transforma ausência de
execução em recibo. A conferência do GitHub continua apontando recibo ausente,
e reprova quando um recibo da coorte ativa passa de 15 dias (14 do SLA mais 1
de tolerância). Com a renovação a partir de 9 dias, segunda e quinta, o recibo
chega a 11 dias numa semana normal, e uma rodada perdida é coberta pela
seguinte antes da conferência. Duas rodadas seguidas sem renovar levam o
recibo a 14 dias e geram alerta (`::warning::`); a terceira reprova
(`::error::`), uns 7 dias depois da primeira falha. A tolerância de 1 dia
absorve rodada atrasada, que o launchd executa quando o Mac acorda.

Processo que a decisão editorial mandou não publicar não trava a renovação. O
aplicador tira do recibo novo o item de `ocorrencias_ambiguas` ou
`homonimos_descartados` cujo par (candidato, CNJ) bate exatamente com
`scripts/data/processos-decisao-editorial.json`. O recibo não registra a
retirada, porque o detalhe é exposto na API pública: a contagem do motivo
acompanha a lista restante. A quantidade e as chaves de hash saem só no JSON do
aplicador (`excluidos_por_veto_editorial`, `excluidos_por_veto`). A retirada nunca
gera ausência confirmada: `vazio_confirmado` que perdeu uma ocorrência ambígua
renova como `indeterminado`, e quem já estava `indeterminado` continua assim.

Continua indo para revisão humana, sem renovar o recibo anterior, o alvo cujo CNJ
vetado esteja em outro lugar do plano (por exemplo em `processos`, entre os
achados publicáveis, ou no recibo anterior) ou cuja confirmação editorial
pendente não seja válida. Nesse caso, passados 15 dias a conferência depois da
coleta reprova, a rodada local grava o marcador de falha e o workflow fica
vermelho até a revisão. É o comportamento esperado: o SLA daquele candidato está
vencido.

## Sinal de falha

O launchd guarda só o código de saída da última rodada (`last exit code` em
`launchctl print gui/$(id -u)/br.com.puxaficha.processos-local`), e um novo `bootstrap` o zera. Por
isso a rodada agendada também deixa um sinal em
`~/Library/Application Support/puxa-ficha/`:

- `processos-local.ultima-rodada`: código, horário UTC e caminho do log da última
  rodada agendada.
- `processos-local.falha`: criado quando a rodada termina com código diferente de
  zero, com o mesmo conteúdo. Só uma rodada agendada bem-sucedida o apaga. A
  falha também aparece na Central de Notificações do macOS, e a rodada
  seguinte registra no log que a anterior falhou.

Rodada manual com `--verificar` ou `--dry-run` não mexe nesses arquivos. Se
o sinal não puder ser gravado, a rodada termina com erro, mesmo que a coleta
tenha passado. O instalador recusa clone em
`~/Documents`, `~/Desktop`, `~/Downloads` ou no iCloud Drive, pastas que o
launchd não lê: instalar a partir de um clone em
`~/Library/Application Support/puxa-ficha/repo`.

## Renovação e suspensão

A vigência está no próprio launcher: depois de 25/10/2026 (UTC) a rodada
registra `Vigência agendada encerrada` e sai sem ler segredos. Para renovar,
mudar a data em `scripts/processos-local/coletar-local.sh` por PR e, depois do
merge, rodar de novo o instalador a partir da `main`. Se a `main` ou o launcher
instalado divergirem, a rodada para com erro no log antes de ler segredos.

Para suspender as próximas rodadas:

```bash
launchctl bootout gui/$(id -u)/br.com.puxaficha.processos-local
```
