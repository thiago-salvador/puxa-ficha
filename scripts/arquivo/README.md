# Espelho estático do arquivo das eleições 2026

O site arquivado é servido como arquivos, sem servidor nem banco. Para refazer o espelho:

1. Build no modo estático, com o banco ainda no ar:

   ```sh
   SENADO_ENABLED=true NEXT_PUBLIC_ARQUIVO_ESTATICO=1 npm run build
   SENADO_ENABLED=true NEXT_PUBLIC_ARQUIVO_ESTATICO=1 npx next start -p 3100
   ```

2. Num `<destino>` vazio, espelhar primeiro as APIs que a ficha busca no navegador e depois páginas, imagens e downloads. A ordem importa: a fase de imagens também lê os JSON de `<destino>/api`.

   ```sh
   node scripts/arquivo/espelhar-apis.mjs http://localhost:3100 <destino>
   node scripts/arquivo/espelhar-paginas.mjs http://localhost:3100 <destino> .
   cp scripts/arquivo/vercel.estatico.json <destino>/vercel.json
   ```

   As rotas da ficha têm limite de 60 chamadas por minuto; o espelho das APIs leva cerca de 1h30.

   Antes de publicar, ler `<destino>/_relatorio-apis.json` e `<destino>/_relatorio.json`: cada item de `falhas` precisa de revisão. Um documento, lista ou imagem que falhou não é gravado pela metade; ele fica de fora e aparece ali.

3. Conferir localmente com as mesmas regras da hospedagem:

   ```sh
   node scripts/arquivo/servir-espelho.mjs <destino> 4100
   ```

O que muda no modo estático (`NEXT_PUBLIC_ARQUIVO_ESTATICO=1`):

- imagens remotas viram `/_img/<hash>.<ext>?o=<origem>` (loader em `src/lib/arquivo-image-loader.ts`);
- downloads com parâmetro viram `/arquivo-dados/<url codificada>.<csv|json>`;
- o documento do programa de governo vem num arquivo só (`programa-documento/<id>.json`);
- as buscas de doadores e de programas viram aviso de ferramenta encerrada com link para os dados abertos.
