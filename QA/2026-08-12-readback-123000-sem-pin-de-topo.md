# O readback da 20260812123000 não policia mais o topo do ledger

Data: 12/08/2026

## Por que este arquivo existe

O mesmo readback interrompeu a Fase 4 **duas vezes**, nas duas sem defeito
nenhum de dado:

1. run `31628201963`, quando a `20260812124000` foi aplicada e o topo deixou de
   ser a `123000`;
2. run `31639498568`, quando a `20260812125000` foi aplicada e o topo deixou de
   ser a `124000`.

A primeira correção ensinou o readback a aceitar **dois topos nomeados**. Foi
uma correção estreita demais, e a segunda interrupção provou isso na prática:
enumerar topos aceitos não resolve o problema, só adia, porque **cada migration
nova cria mais um estado legítimo** que o arquivo antigo não conhece.

## O que muda

O readback passa a exigir apenas a própria versão aplicada:

```sql
IF (SELECT count(*) FROM supabase_migrations.schema_migrations
     WHERE version = '20260812123000') <> 1 THEN
  RAISE EXCEPTION 'readback 20260812123000: versao ausente ou duplicada no ledger';
END IF;
```

## Nada de cobertura se perde

A asserção removida existia para detectar migration não prevista aplicada por
fora. Essa verificação continua existindo, e num lugar melhor: o runner da
Fase 4 já faz as duas coisas, antes de rodar qualquer readback.

- `npm run audit:ledger:gate -- --remotas=...` confere a **identidade integral**
  da lista de versões remotas, recusando versão inesperada e troca de migration
  histórica por outra de mesma cardinalidade;
- logo em seguida o runner confere o par `(total, topo)` esperado do release, que
  hoje é `395` e `20260812125000`, e é atualizado a cada release na mesma PR.

Ou seja: a identidade do ledger é responsabilidade do runner, que a conhece por
inteiro e é versionado junto com o release. Um readback de migration conhece o
próprio assunto, não a linha do tempo inteira do projeto.

## Provas

- readback corrigido executado read-only contra a produção real, com o topo em
  `20260812125000`: PASS;
- varredura dos **24 readbacks canônicos contra produção**: antes desta correção
  23 passavam e só a `123000` reprovava, o que confirma que a classe está fechada
  e não há outro arquivo com o mesmo vício;
- harness PostgreSQL 17: o cenário de ledger foi reescrito para o contrato novo e
  prova que o readback aceita `20260812124000`, `20260812125000` e até uma versão
  estranha aplicada depois, e que **continua recusando** a ausência da própria
  versão;
- suíte completa 3.045/3.045, typecheck, lint, allowlist e `bash -n` verdes.
