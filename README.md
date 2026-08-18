# Puxa Ficha

Plataforma de transparência eleitoral para as eleições de 2026. Uma página por
candidato, com patrimônio declarado, processos, histórico eleitoral e votações,
cada dado acompanhado da sua fonte e da data em que foi verificado.

No ar em [puxaficha.com.br](https://puxaficha.com.br).

## Este repositório

Está em migração. Por enquanto ele carrega só a governança do projeto: licença,
política de segurança, guia de contribuição, código de conduta e a lista de
donos de código. O código da aplicação entra em seguida, por pull request.

## Como o projeto trata dado

A regra que governa tudo aqui: **dado sem fonte não entra**. Não se preenche
campo com "aguardando pesquisa", "em análise" ou equivalente. Zero e não
aplicável são valores válidos; "ainda não verifiquei" não é. Ausência só vale
quando é provada, com a lista das fontes consultadas e a data.

A licença Apache 2.0 cobre o código. Os dados exibidos são registros públicos,
sujeitos à Lei de Acesso à Informação, e não à licença do software. Dado pessoal
de quem não é candidato não entra: CPF de doador, por exemplo, aparece apenas
como hash.

## Contribuir

Correção de dado, fonte melhor, erro de português ou código: tudo entra por
issue ou pull request, à vista de todo mundo. Leia o
[CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir. Encontrou falha de segurança?
O caminho está em [SECURITY.md](SECURITY.md), e não é uma issue pública.

Nenhuma alteração vai ao ar sem revisão, e a decisão final sobre o que é
publicado continua sendo editorial.
