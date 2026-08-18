# Regras de firewall na Vercel

A configuração do Vercel WAF não vive no repositório: ela é estado do projeto na
plataforma. Este arquivo existe para que a configuração esperada seja revisável
em code review e reconstruível se o projeto for recriado.

Fonte de verdade continua sendo a plataforma. Para conferir divergência:

```bash
vercel firewall rules list --expand
```

## Por que rate limit na borda, e não só no código

O projeto tem `createFixedWindowIpRateLimiter` (`src/lib/request-rate-limit.ts`),
que guarda os contadores num `Map` em memória do processo. Em serverless isso é
**por instância**: cada instância ativa tem o próprio contador, então o teto
efetivo se multiplica pelo número de instâncias, e o contador zera a cada cold
start. Além disso, a requisição bloqueada por ele já custou uma invocação.

O WAF resolve os dois pontos: o contador é da plataforma, e a Vercel não cobra
requisição bloqueada por regra de firewall. O limitador de processo continua
valendo como camada de dentro, com regras mais finas por caminho.

Ressalva: os contadores do WAF são **por região**. O projeto roda só em `gru1`
(`vercel.json`), então na prática há um contador só. Se um dia houver mais
regiões, o teto real passa a ser aproximadamente `N × limite`.

## Regras esperadas

| Nome | Condição | Limite | Ao exceder |
|---|---|---|---|
| `rate-limit-preview` | `path` começa com `/preview/` e ambiente é produção | 10 req / 60s por IP | 429 |
| `rate-limit-alerts` | `path` começa com `/api/alerts/` e ambiente é produção | 30 req / 60s por IP | 429 |
| `rate-limit-og-e-cards` | `path` começa com `/api/card/` **ou** termina em `/og`, ambiente produção | 120 req / 60s por IP | 429 |

### `rate-limit-alerts`

Cobre a superfície que dispara email (Resend) e grava assinante. Trinta
requisições por minute por IP é folgado para um humano preenchendo um formulário,
e corta bulk de bot antes de chegar na função.

O `rate_limit` foi escolhido em vez de `challenge` de propósito: o formulário
envia por `fetch`, e uma página de desafio devolvida a um `fetch` não renderiza,
só quebraria o envio sem o usuário entender o motivo.

Dentro da aplicação, a mesma rota tem três camadas próprias, que continuam
valendo: gate de origem (`alerts-csrf`), janela por IP no processo
(12 req / 10 min) e teto de banco por hora para assinante novo, mais o cooldown
de 15 minutos por assinante.

### `rate-limit-og-e-cards`

Geração de imagem é cara por requisição. O limite é mais alto porque uma página
pode disparar várias, e porque crawler de rede social busca OG legitimamente.

## Como aplicar

```bash
vercel firewall diff
vercel firewall publish --yes
```

Regras de `rules` e `ip-blocks` ficam em rascunho até o `publish`. Se algo
estrangular tráfego legítimo, o caminho de volta é
`vercel firewall rules disable "<nome>"` seguido de `publish`.

## O que não está configurado

- **Bot Protection / BotID.** Nenhum formulário do site tem captcha, honeypot ou
  desafio. As regras acima limitam volume, não distinguem humano de script
  dentro do limite. Se o abuso aparecer, o próximo passo é `@vercel/botid` no
  formulário de alertas.
- **IP blocks e system bypass.** Zero de cada, de propósito: bloqueio por IP em
  site de consulta pública sobre política é decisão editorial, não operacional.
