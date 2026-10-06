# Design system · Projetos Cariati (“vidro holográfico”)

Camada visual única em `src/theme.css` (carregada depois de `styles.css`). Nada aqui muda regra de negócio.

## Tokens (`:root`, escuro padrão; `html[data-theme="light"]` para o claro)
- **Superfícies:** `--bg #0B0D14`, `--card-solid #12151F`, `--card-alto #1A1E2C`, `--card` (vidro translúcido), `--soft`, `--tint`.
- **Texto:** `--ink #F5F7FA`, `--ink2 #A4ADC0`, `--ink3`. **Linhas:** `--line`.
- **Identidade:** primária `--pri-a #FF9F1C → --pri-b #FF6B35` (`--grad-pri`), secundária `--sec-a #8B5CF6 → --sec-b #C084FC` (`--grad-sec`), magenta `--mag #D946EF`, informação `--info #22D3EE`.
- **Estados:** `--green #34D399`, `--amber #FBBF24`, `--red #F87171` (sempre com ícone e texto).
- **Dados (gráficos):** `--s1..s4` (ciano, âmbar, violeta, verde) e `--st-*`.
- **Escala:** espaços `--sp-1..12` (4 px), raios `--r-sm/md/lg/xl/pill`, sombras `--sombra-1/2`, brilho `--glow-pri/sec`, desfoque `--blur`, tempos `--dur-1/2/3` (150/220/320 ms), `--ease`.
- **Fontes:** corpo Plus Jakarta Sans, títulos e números Space Grotesk (números tabulares).

## Componentes
| Componente | Onde |
|---|---|
| Painel de vidro (`.card`, `.kpi`, `.viz-tile`, `.holo` com marcas de mira) | `theme.css` §4 |
| Menu lateral recolhível, “Criar novo”, favoritos, migalhas, busca Ctrl/Cmd+K | `AppEquipe.tsx`, `ui/Paleta.tsx`, `ui/Migalhas.tsx`, `ui/menu.ts` |
| Navegação inferior móvel + folha “Mais” | `AppEquipe.tsx`, `AppCliente.tsx` |
| Botões (`primario`, padrão, `link`, `perigo`), inputs, selects, checkbox, interruptor (`.check.sw`), datas | `theme.css` §6 |
| Abas, segmentos, chips de status | `theme.css` §7 |
| Medidor luminoso `Anel`, `Orbe`, `Contador` animado | `ui/Holo.tsx` |
| Esqueleto (`Carregando`), estado vazio (`Vazio`), erro (`Erro`) | `ui/Holo.tsx` |
| Avisos com “Desfazer” | `ui/avisos.tsx` |
| Modais viram bottom sheet no celular | `theme.css` §10 |
| Tema claro/escuro (alternância na barra superior) | `ui/tema.ts` |
| Fundo (luzes desfocadas, cidade, grade, circuito, parallax leve) | `ui/Atmosfera.tsx` |

## Acessibilidade e desempenho
Foco visível ciano, rótulos em todos os campos, estados com ícone e texto, `prefers-reduced-motion` e `prefers-reduced-transparency` respeitados, fallback sólido sem `backdrop-filter`.
