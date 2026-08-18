# Contribuindo com o Puxa Ficha

Obrigado pelo interesse. O Puxa Ficha é uma plataforma cívica de consulta
pública sobre os candidatos das eleições brasileiras de 2026, e o produto inteiro
depende de uma coisa: quem lê uma ficha precisa conseguir conferir de onde veio
cada dado. Contribuição que melhora precisão, rastreabilidade, acessibilidade e
cobertura é bem-vinda.

Antes de qualquer coisa, leia o [Código de Conduta](CODE_OF_CONDUCT.md). Se o
que você encontrou é uma falha de segurança, não abra issue: o caminho é o
[SECURITY.md](SECURITY.md).

## A regra que faz esse projeto diferente

A maior parte dos projetos aceita um campo vazio preenchido com um rótulo de
espera. Aqui não.

**Nunca inventar.** É proibido escrever no dado qualquer coisa que não seja o
dado. Isso vale para valor, data, número, descrição e fonte.

**Zero e não aplicável são valores. "Aguardando" não é.** Um candidato com zero
processos tem zero, e zero é um dado publicável. Um campo que não faz sentido
para aquele cargo é não aplicável, e isso também é publicável. Já
"aguardando análise", "em verificação", "em breve", "não informado" e primos
próximos não são dado nenhum: são lacuna, e lacuna não ocupa o campo público.
Lacuna fica registrada como lacuna, com dono e fila, e o campo permanece vazio
até alguém ir buscar o valor de verdade.

A diferença importa porque as duas coisas parecem iguais na tela e são opostas.
"Zero doações declaradas" é uma afirmação que alguém verificou. "Aguardando
dados de doação" é uma afirmação sobre o nosso processo interno, escrita no
espaço reservado à informação sobre o candidato. A primeira informa. A segunda
faz o leitor achar que sabe algo que ninguém checou.

## Correção de dado exige URL de fonte oficial que abre

Esta é a exigência mais rígida do projeto, e a que mais reprova contribuição bem
intencionada.

Para propor correção, adição ou remoção de qualquer dado de ficha, você precisa
mandar **a URL da fonte oficial, e ela precisa abrir**. Cole o link e confira
que ele carrega sozinho, numa aba anônima, sem login e sem sessão sua.

Fonte oficial é o site do órgão que produz o dado: TSE e DivulgaCand, Câmara dos
Deputados, Senado Federal, Portal da Transparência, tribunais, diários oficiais,
portais dos governos estaduais. Matéria de imprensa serve como pista para achar
a fonte, e não como a fonte.

Não são aceitos como fonte de dado:

- Link que exige login, sessão, cookie de busca ou token para abrir.
- Link para o formulário de busca em vez do resultado. Se o sistema do órgão não
  gera URL estável para o registro, diga isso e descreva o caminho exato de
  navegação até ele, com os termos digitados em cada campo.
- Print de tela sem o link correspondente. Um print prova o que você viu, não
  prova o que está publicado agora.
- Post em rede social, captura de vídeo, blog, PDF hospedado em drive pessoal.
- "É de conhecimento público", "todo mundo sabe", "estava no jornal".

Se você não conseguiu URL que abre, ainda vale mandar. Abra a issue dizendo o
que você acha que está errado e o que já tentou. Isso é uma pista útil e vira
fila de verificação. O que não acontece é o dado mudar na ficha antes de a fonte
existir.

Quando a correção envolver uma pessoa e um fato desabonador, a régua sobe: o
documento precisa mostrar o estado atual do caso, não apenas que ele existiu um
dia.

## Como contribuir, passo a passo

Tudo entra por **issue** ou **pull request**, à vista de todo mundo. Não há
canal privado de curadoria, e a única exceção é segurança.

**Issue** é o caminho para: erro de dado, fonte melhor do que a que está lá,
discordância de critério ou de metodologia, erro de português, bug, sugestão.
Discordar do critério é contribuição legítima, e o lugar é uma issue pública.

**Pull request** é o caminho quando você já tem a mudança pronta. Para mudança
grande, abra a issue antes de escrever código, para alinhar escopo. Faça fork,
crie a branch a partir da `main`, commits claros, e descreva no PR o que muda e
por quê.

Nenhuma alteração vai ao ar sem passar por **revisão do mantenedor**. Isso vale
inclusive para PR com CI verde: o CI prova que o código roda, não que o dado
está certo nem que a mudança deve ser publicada.

**Decisão editorial não é automática.** O que entra numa ficha, como é
formulado e o que fica de fora é decisão editorial de quem mantém o projeto,
tomada caso a caso. Fonte válida é a condição para uma correção ser considerada,
não a garantia de que ela será publicada do jeito proposto. Quando a decisão for
contra o que você propôs, a resposta na issue diz o motivo.

Retificação de ficha também pode ser pedida por email, em
**contato@puxaficha.com.br**, com o assunto **Retificação de ficha**, mandando o
link da ficha, o trecho questionado e a fonte que sustenta a correção. O pedido é
analisado sem promessa de remoção automática de dado de interesse público.

## Rodando o projeto local

O código da aplicação fica em **`app/`**, e é de lá que todos os comandos rodam.
A raiz do repositório guarda a documentação e a operação.

Você precisa de Node.js **24.x** (está no `app/.nvmrc`) e de uma conta no
[Supabase](https://supabase.com), onde o plano gratuito basta.

```bash
cd app
npm ci
cp .env.example .env.local
```

Preencha no mínimo `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
`NEXT_PUBLIC_SITE_URL`. Os valores do Supabase estão em **Project Settings →
API** no painel do seu projeto. O `app/.env.example` documenta todas as
variáveis, inclusive as opcionais.

O schema e os seeds vivem em `app/supabase/migrations/` como SQL sequencial e
sobem sozinhos num projeto Supabase vazio:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Depois:

```bash
npm run dev      # http://localhost:3000
```

Nunca commite `.env.local`. O `.gitignore` já bloqueia, e no projeto se
documenta o nome da variável, jamais o valor.

## Gates antes de abrir o PR

Rode dentro de `app/`:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # testes unitários
npm run build       # build de produção
```

Esses quatro são o mínimo. O CI (`.github/workflows/ci.yml`) roda mais coisa
sobre o mesmo PR, incluindo verificação ortográfica da interface, checagem de
código morto, validação do seed e auditorias de dado. Ele funciona em PR vindo
de fork, sem depender de segredo, e precisa passar para o merge acontecer.

Os testes visuais com Playwright são opcionais no seu ambiente e pedem
`npx playwright install` antes.

## Estilo e princípios de código

- TypeScript, Next.js com App Router, Tailwind. Siga o padrão do código que já
  está lá.
- ESLint e Prettier decidem a formatação. Não brigue com eles.
- **Nada de número hardcoded** em tela de dado. Todo valor exibido sai de uma
  consulta ou de uma fonte rastreável no código. Sem dado disponível, a
  interface mostra estado vazio explícito, nunca um número plausível.
- **Privacidade.** CPF e outros identificadores pessoais não chegam ao cliente.
  CPF é chave de cruzamento no servidor, durante a ingestão. Dado pessoal de
  quem não é candidato não entra no repositório.
- **Pipeline de dados.** Os scripts de ingestão em `app/scripts/` precisam ser
  idempotentes e respeitar a hierarquia de proveniência: fonte de prioridade
  menor não sobrescreve dado vindo de fonte de prioridade maior.
- **Neutralidade.** O produto não emite juízo de valor sobre candidato. O texto
  editorial descreve o que a fonte diz, sem adjetivo de avaliação.

## Licença das contribuições

Ao contribuir, você concorda que sua contribuição será licenciada sob a
[Apache License 2.0](LICENSE), a mesma do projeto, incluindo a concessão de
patente da seção 3.

Os dados exibidos são registros públicos, sujeitos à Lei de Acesso à Informação,
e não à licença do software.
