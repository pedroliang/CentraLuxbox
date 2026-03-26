# Resumo do Projeto: CentraLu Xbox (Ref: 2026-03-26)

Este documento serve como um guia de referência rápida sobre o que foi desenvolvido, permitindo que futuras sessões de IA ou outros desenvolvedores entendam o estado atual do projeto.

## 📋 Visão Geral
O **CentraLu Xbox** é um sistema web moderno para consulta de estoque e cálculo de cubagem para a CentraLu. É 100% frontend (HTML/CSS/JS) e consome dados de uma planilha do Google Sheets.

## 🚀 Funcionalidades Principais
9.  **Busca Inteligente:** Consulta de produtos por código ou parte da descrição.
10. **Cálculo de Cubagem:** Volume (m³) e peso (kg) automáticos baseado na quantidade de caixas.
11. **Lista de Produtos:** Carrinho dinâmico com totais consolidados.
12. **Impressão/PDF:** Layout otimizado com marca CentraLux e metadados de expedição.
13. **Exportação Excel (NOVO):** Download direto do pedido em CSV otimizado para Excel (com BOM UTF-8 e separadores BR).
14. **Gerenciamento de Pedidos:**
    *   **Salvar Pedido:** Identificado por número do pedido e nome do cliente.
    *   **Sincronização Cloud (MELHORADA):** Pedidos locais e do Supabase são mesclados bidirecionalmente.
    *   **Status do Pedido:** Sistema visual de status (ex: Pendente).
    *   **Resiliência de Dados:** Novo sistema de carregamento com múltiplos proxies e timeouts para evitar falhas de conexão.

## 📂 Estrutura de Arquivos
- `index.html`: Base da aplicação, modal de ajuda e área de pedidos salvos.
- `style.css`: Design System (Glassmorphism), temas Dark/Light e regras `@media print`.
- `app.js`: Lógica de busca, cálculos, persistência local e sincronização Supabase.

## 📊 Fonte de Dados (Google Sheets)
- **URL:** [Clique aqui](https://docs.google.com/spreadsheets/d/1534KpKX7vCVz0W-FWezgHTSZqHcpy6-bG8vgGXAzUeM/edit?gid=0)
- **Colunas Usadas:** A (Cód), B (Desc), O-Q (Dimensões cm), R (Peso kg), S (Lote), T (GTIN-14).

## ⚙️ Configurações Supabase (Cloud Sync)
- **URL do Projeto:** `https://fruwdnbysjpaccregbnj.supabase.co`
- **Tabela:** `cxb_orders`
- **Colunas:** `id` (bigint), `order_num` (text), `customer_name` (text), `items` (jsonb), `created_at` (timestamp).
- **Key (Anon):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZydXdkbmJ5c2pwYWNjcmVnYm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjM3NTIsImV4cCI6MjA4OTY5OTc1Mn0.l7R4DGuXTKIxtDPWGfGvKCLHPIXWt8jTYoN-8eeys34`

## 🔗 Repositório GitHub
- **URL:** [https://github.com/pedroliang/CentraLuxbox](https://github.com/pedroliang/CentraLuxbox)
- **Status:** Sincronizado e Pushed (26/03/2026).
- **Token Utilizado:** `ghp_...ZV` (fornecido pelo usuário).

---
*Atualizado em: 25/03/2026*
