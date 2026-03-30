# Home Page Redesign — Puxa Ficha

**Data:** 2026-03-30
**Status:** Aprovado
**Referencias:** CityBoys (tipografia editorial), Revolut (data-forward), Relume Kit v3.7 (secoes modulares)
**Restricoes:** Inter (unica fonte), preto/branco only, glassmorphism nos cards

## Decisoes

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Hero | Hibrido (tipografia massiva + data bar) | Nome confrontacional + dados dao credibilidade |
| Grid candidatos | Cards foto-forward refinados | Fotos sao o asset mais forte, 13 e numero perfeito pra grid |
| Header/nav | Transparente no topo, glass no scroll | Hero limpo, usabilidade preservada |
| Footer | Minimalista uma linha | Nao compete com conteudo |

## Design System

### Spacing (Relume-inspired)

- section-sm: `py-12`
- section-md: `py-16 lg:py-20`
- section-lg: `py-20 lg:py-28`
- container: `max-w-7xl mx-auto px-5 md:px-12`

### Escala tipografica

| Nome | Spec | Uso |
|------|------|-----|
| display | clamp(64px,12vw,140px) Inter 900 tracking-[-0.04em] lh-0.9 | Hero "PUXA FICHA" |
| stat | 48px Inter 700 | Numeros do hero |
| heading | 30-36px Inter 700 tracking-tight | Titulos de secao |
| card-name | 20-24px Inter 700 tracking-[-0.02em] lh-1.1 | Nome no card |
| body | 16-18px Inter 400 leading-relaxed | Texto corrido |
| label | 11px Inter 400-600 uppercase tracking-[0.12em] | Eyebrows, metadata |
| small | 10-11px Inter 400-500 | Stats, captions |

### Componentes especiais

- **Slash divider**: `overflow-hidden whitespace-nowrap text-black/10 text-[11px] select-none` com "/" repetido
- **Eyebrow label**: Inter 400-600, 11px, uppercase, tracking 0.12em, text-black/40 (ou text-white/50 em glass)
- **Pill CTA**: rounded-full, border border-white/20, bg-white/10, Inter 500 11px, hover:bg-white hover:text-black

## Secoes da Home

### 1. Header (64px)
- Fixed, z-50
- "PUXA FICHA" Inter 700 16px uppercase esquerda
- Links (PRESIDENCIA / GOVERNADORES / SOBRE) Inter 400 12px uppercase tracking-[0.12em] text-black/50
- Menu + (burger) direita
- Scroll behavior: transparente -> bg-white/80 backdrop-blur-md border-b border-black/5

### 2. Hero (pt-28 pb-20)
- "PUXA FICHA" em 2 linhas, display scale, Inter 900
- Slash divider (my-8)
- Label "ELEICOES 2026" (11px label style)
- 3 stats em row: candidatos / patrimonio / processos (48px bold + 11px label)
- Stats calculados server-side (dados reais do Supabase)

### 3. Search (mb-10)
- rounded-full pill shape
- border-black/10, bg-transparent ou bg-black/[0.02]
- max-w-md
- Icone search esquerda, X clear direita

### 4. Grid de candidatos
- grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5
- Card: rounded-[20px] sm:rounded-[24px], aspect 3/4
- Hover: -translate-y-1.5, scale-105 na foto
- Glass overlay: backdrop-blur(20px) bg-rgba(0,0,0,0.25)
- Hierarquia no glass: eyebrow partido (text-only) -> nome bold -> cargo -> stats -> pill "Ficha"
- Stagger animation fadeSlideUp com delay

### 5. Footer (pt-8 pb-12 mt-20)
- Slash divider no topo
- "PUXA FICHA" Inter 700 14px uppercase esquerda
- "TSE . CAMARA . SENADO" + credito direita
- Tudo em uma linha, text-black/30 pras fontes
