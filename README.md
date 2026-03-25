# CentraLu Xbox 🎮📦

Sistema moderno de consulta e cálculo de cubagem de estoque.

## Funcionalidades

- 🔍 **Busca por código** — Insira o código do produto (Col A da planilha) e veja instantaneamente a descrição, dimensões, peso, lote e GTIN-14
- 📦 **Cálculo de cubagem** — Informe a quantidade de caixas e obtenha o volume em m³ e o peso total
- ➕ **Múltiplos produtos** — Adicione quantos códigos precisar e acompanhe os totais consolidados em tempo real
- 🌙 **Dark / Light mode** — Tema escuro por padrão com alternância suave

## Como usar

1. Abra o `index.html` em qualquer navegador moderno
2. Aguarde o carregamento dos dados da planilha (indicador no header)
3. Digite o código do produto e a quantidade de caixas
4. Clique em **Adicionar Produto**
5. Repita para quantos produtos desejar
6. Confira os **Totais Consolidados** no painel inferior

## Fonte dos dados

Os dados são carregados diretamente do Google Sheets (Estoque 1) via exportação CSV pública.

## Fórmula de cubagem

```
Volume (m³) = (X cm / 100) × (Y cm / 100) × (Z cm / 100) × Qtd. Caixas
Peso  (kg)  = Peso por Caixa (kg) × Qtd. Caixas
```

## Tech Stack

- HTML5 + CSS3 (Vanilla)
- JavaScript (ES2020+)
- Google Fonts – Inter
- Sem dependências externas, sem backend

---

*CentraLu Xbox © 2026*
