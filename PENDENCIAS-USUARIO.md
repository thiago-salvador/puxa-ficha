# Pendências Para Confirmar Manualmente

Este arquivo existe para registrar informações simples de confirmar fora do pipeline quando a execução travar em um detalhe factual.

Regra de uso:
- eu só adiciono uma linha aqui quando a busca automática ficar inconclusiva
- você pode responder com o valor e, se possível, com a fonte
- se vier sem fonte, eu uso como pista operacional e tento confirmar depois
- se vier com fonte, eu consigo fechar o campo com muito menos risco

Prioridade:
- `P0`: bloqueia publicação ou gate factual
- `P1`: não bloqueia publicação, mas deixa warning relevante
- `P2`: melhoria editorial

Status:
- `aberto`: ainda preciso da informação
- `respondido`: você trouxe o valor, falta eu aplicar/confirmar
- `fechado`: valor aplicado e registrado

| Prioridade | Status | Slug | Nome | Estado | Partido | Campo | Valor atual no banco | Informação necessária | Motivo do bloqueio | Fontes sugeridas |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | fechado | `evandro-augusto` | Evandro Augusto | `RS` | `MISSAO` | `data_nascimento` | `null` | Data de nascimento exata | Busca encerrada por ora. O campo pode permanecer vazio até confirmação oficial futura. | perfil oficial, entrevista com idade/data, currículo/Lattes, página pública confiável |

## Como responder

Formato ideal:

```md
Slug: evandro-augusto
Campo: data_nascimento
Valor: 1982-05-17
Fonte: https://exemplo.com/perfil-oficial
Observação: menciona a data explicitamente
```

Formato mínimo:

```md
Slug: evandro-augusto
Campo: data_nascimento
Valor: 17/05/1982
```

## Histórico de uso

- 2026-04-02: arquivo criado durante a execução do plano de auditoria total 144/144
- 2026-04-02: `evandro-augusto.data_nascimento` deixou de bloquear o audit; pendência encerrada por ora e mantida como possível confirmação futura
