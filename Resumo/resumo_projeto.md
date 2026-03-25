# Resumo do Projeto: CentraLu Xbox

Este documento serve como um guia de referência rápida sobre o que foi desenvolvido neste chat, permitindo que futuras sessões de IA ou desenvolvedores entendam o estado atual do projeto.

## 📋 Visão Geral
O **CentraLu Xbox** é um sistema web moderno para consulta de estoque e cálculo de cubagem, desenvolvido para a CentraLu. O sistema é 100% frontend (HTML/CSS/JS) e consome dados diretamente de uma planilha do Google Sheets.

## 🚀 Funcionalidades Implementadas
- **Busca por Código:** Consulta instantânea de produtos pelo código (Coluna A da planilha).
- **Cálculo de Cubagem:** Cálculo automático de volume (m³) e peso (kg) com base na quantidade de caixas.
- **Lista de Produtos:** Suporte para adicionar múltiplos itens com totais consolidados.
- **Impressão/PDF:** Layout otimizado para impressão com marca CentraLux, número do pedido, nome do cliente e timestamp de expedição.
- **Modo Escuro/Claro:** Design moderno com vidro (glassmorphism), iniciando sempre em modo escuro.
- **GitHub Pages:** Deploy automático via [https://pedroliang.github.io/CentraLuxbox/](https://pedroliang.github.io/CentraLuxbox/).

## 📂 Estrutura de Arquivos
- `index.html`: Estrutura da página, formulários e elementos de impressão.
- `style.css`: Design system, temas dark/light e regras `@media print`.
- `app.js`: Lógica de busca, parser CSV, cálculos e integração com a planilha.
- `README.md`: Instruções de uso e documentação técnica básica.

## 📊 Fonte de Dados
- **Google Sheets URL:** `https://docs.google.com/spreadsheets/d/1534KpKX7vCVz0W-FWezgHTSZqHcpy6-bG8vgGXAzUeM/edit?gid=0`
- **Coluna A:** Código
- **Coluna B:** Descrição
- **Coluna O, P, Q:** Dimensões X, Y, Z (cm)
- **Coluna R:** Peso (kg)
- **Coluna S:** Lote
- **Coluna T:** GTIN-14

## ⚙️ Detalhes Técnicos
- **Fórmula de Volume:** `(X/100) * (Y/100) * (Z/100) * quantidade`
- **Parser CSV:** Implementação manual compatível com RFC-4180 para lidar com campos entre aspas e vírgulas embutidas.
- **CORS:** Utiliza o proxy `allorigins` como fallback caso o fetch direto ao Google Sheets falhe no navegador.

## 🔗 Repositório GitHub
- **URL:** [https://github.com/pedroliang/CentraLuxbox](https://github.com/pedroliang/CentraLuxbox)
- **Token Utilizado:** `ghp_...ZV` (fornecido pelo usuário)

---
*Gerado em: 25/03/2026*
