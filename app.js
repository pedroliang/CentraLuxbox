/**
 * CentraLu Xbox – Application Logic
 * Loads product data from Google Sheets CSV and provides
 * cubagem (volume) calculations for multiple products.
 * Includes Supabase cloud sync for saved orders.
 */

// ─── Constants ─────────────────────────────────────────────────────────────
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1534KpKX7vCVz0W-FWezgHTSZqHcpy6-bG8vgGXAzUeM/gviz/tq?tqx=out:csv&gid=0';
const SHEET_URL_ALT = 
  'https://docs.google.com/spreadsheets/d/1534KpKX7vCVz0W-FWezgHTSZqHcpy6-bG8vgGXAzUeM/export?format=csv&gid=0';

// Supabase Config (Extracted from environment)
const SUPABASE_URL = 'https://fruwdnbysjpaccregbnj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZydXdkbmJ5c2pwYWNjcmVnYm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjM3NTIsImV4cCI6MjA4OTY5OTc1Mn0.l7R4DGuXTKIxtDPWGfGvKCLHPIXWt8jTYoN-8eeys34';

// Column indices (0-based) in the actual data rows (after skipping header rows)
const COL = {
  CODE: 0,
  DESC: 1,
  X_CM: 14,
  Y_CM: 15,
  Z_CM: 16,
  PESO: 17,
  LOTE: 18,
  GTIN: 19,
};

const HEADER_ROWS = 3;
const SAVED_ORDERS_KEY = 'cxb-saved-orders';

// ─── State ─────────────────────────────────────────────────────────────────
let productDB = new Map();
let cartItems  = [];
let nextId     = 1;
let supabase   = null;

// ─── DOM refs ───────────────────────────────────────────────────────────────
const themeToggle   = document.getElementById('themeToggle');
const dataStatus    = document.getElementById('dataStatus');
const statusText    = dataStatus.querySelector('.status-text');
const searchForm    = document.getElementById('searchForm');
const codeInput     = document.getElementById('codeInput');
const qtyInput      = document.getElementById('qtyInput');
const orderNumInput = document.getElementById('orderNumInput');
const customerNameInput = document.getElementById('customerNameInput');
const codeError     = document.getElementById('codeError');
const productPreview = document.getElementById('productPreview');
const emptyState    = document.getElementById('emptyState');
const productsList  = document.getElementById('productsList');
const totalsPanel   = document.getElementById('totalsPanel');
const totalItems    = document.getElementById('totalItems');
const totalBoxes    = document.getElementById('totalBoxes');
const totalVolume   = document.getElementById('totalVolume');
const totalWeight   = document.getElementById('totalWeight');
const printBtn      = document.getElementById('printBtn');
const clearAllBtn   = document.getElementById('clearAllBtn');
const toast         = document.getElementById('toast');
const printHeader   = document.getElementById('printHeader');
const printOrderNum = document.getElementById('printOrderNum');
const printCustomerName = document.getElementById('printCustomerName');
const printTimestamp = document.getElementById('printTimestamp');
const saveOrderBtn   = document.getElementById('saveOrderBtn');
const savedOrdersSection = document.getElementById('savedOrdersSection');
const savedOrdersCount   = document.getElementById('savedOrdersCount');
const savedOrdersList    = document.getElementById('savedOrdersList');
const syncStatus         = document.getElementById('syncStatus');
const exportExcelBtn     = document.getElementById('exportExcelBtn');

// ─── Theme ──────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('cxb-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cxb-theme', next);
});

// ─── Supabase Initialize ────────────────────────────────────────────────────
function initSupabase() {
  if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Supabase initialized');
  } else {
    console.warn('Supabase SDK not found');
  }
}

// ─── CSV Loader ─────────────────────────────────────────────────────────────
// Helper for timeout
const fetchWithTimeout = (url, options = {}, timeout = 10000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
  ]);
};

async function loadData() {
  setStatus('loading', 'Carregando dados...');
  try {
    let csvText;
    const sources = [SHEET_URL, SHEET_URL_ALT];
    const proxies = [
      url => url, 
      url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ];

    let lastError;
    for (const url of sources) {
      if (csvText) break;
      for (const getUrl of proxies) {
        try {
          const res = await fetchWithTimeout(getUrl(url), { cache: 'no-store' }, 8000);
          if (res.ok) {
            csvText = await res.text();
            // Auto-detect header rows: if it starts with "Cod.", then it's 1 row (gviz)
            // if it starts with "PRINCIPAL", it's 3 rows (export)
            const firstChars = csvText.substring(0, 20);
            const headerRowsUsed = firstChars.includes('PRINCIPAL') ? 3 : 1;
            parseCSV(csvText, headerRowsUsed);
            break;
          }
        } catch (e) {
          lastError = e;
          console.warn(`Falha para ${getUrl(url)}:`, e);
        }
      }
    }

    if (!csvText) throw lastError || new Error('Falha em todas as tentativas');

    const count = productDB.size;
    setStatus('ready', `${count} produtos carregados`);
    showToast(`Dados carregados: ${count} produtos`, 'success');
  } catch (err) {
    console.error('Load error:', err);
    setStatus('error', 'Erro ao carregar dados');
    showToast('Não foi possível carregar os dados da planilha.', 'error');
  }
}

function setStatus(type, text) {
  if (!dataStatus) return;
  dataStatus.className = `data-status ${type}`;
  statusText.textContent = text;
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────
function parseCSV(text, headerRows = 3) {
  const rows = parseCSVRows(text);
  const dataRows = rows.slice(headerRows);

  productDB.clear();
  for (const row of dataRows) {
    const code = (row[COL.CODE] || '').trim();
    if (!code || isNaN(+code)) continue;

    const product = {
      code,
      desc:  (row[COL.DESC] || '').trim(),
      x:     parseNum(row[COL.X_CM]),
      y:     parseNum(row[COL.Y_CM]),
      z:     parseNum(row[COL.Z_CM]),
      peso:  parsePeso(row[COL.PESO]),
      lote:  (row[COL.LOTE] || '').trim(),
      gtin:  (row[COL.GTIN] || '').trim(),
    };

    if (!productDB.has(code)) {
      productDB.set(code, product);
    }
  }
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let col = '';
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { col += '"'; i += 2; continue; }
        inQuote = false;
      } else col += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { row.push(col); col = ''; }
      else if (ch === '\r' && text[i + 1] === '\n') { row.push(col); col = ''; rows.push(row); row = []; i += 2; continue; }
      else if (ch === '\n' || ch === '\r') { row.push(col); col = ''; rows.push(row); row = []; }
      else col += ch;
    }
    i++;
  }
  if (col !== '' || row.length > 0) { row.push(col); rows.push(row); }
  return rows;
}

function parseNum(val) {
  if (!val) return null;
  const s = String(val).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parsePeso(val) {
  if (!val) return null;
  const s = String(val).replace(/[^\d,.]/g, '').trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Search / Preview ───────────────────────────────────────────────────────
codeInput.addEventListener('input', () => {
  codeError.textContent = '';
  const val = codeInput.value.toLowerCase().trim();
  if (!val) { productPreview.textContent = ''; return; }

  // Try exact code match first
  let p = productDB.get(val);
  
  // If not found, try description search (starts with or includes)
  if (!p) {
    for (const prod of productDB.values()) {
      if (prod.desc.toLowerCase().includes(val)) {
        p = prod;
        break;
      }
    }
  }

  if (p) productPreview.innerHTML = `✓ ${p.desc || 'Sem descrição'} (Cód: ${p.code})`;
  else productPreview.textContent = '';
});

// ─── Form Submit ─────────────────────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (productDB.size === 0) { showToast('Dados ainda não carregados.', 'error'); return; }
  const val = codeInput.value.trim();
  const qty = parseInt(qtyInput.value, 10) || 1;
  codeError.textContent = '';
  if (!val) { codeError.textContent = 'Informe um código ou descrição.'; codeInput.focus(); return; }
  
  // Find product (same logic as preview)
  let product = productDB.get(val);
  if (!product) {
    for (const prod of productDB.values()) {
      if (prod.desc.toLowerCase().includes(val.toLowerCase())) {
        product = prod;
        break;
      }
    }
  }

  if (!product) { codeError.textContent = `Produto "${val}" não encontrado.`; codeInput.focus(); return; }
  if (qty < 1) { codeError.textContent = 'Mínimo: 1.'; qtyInput.focus(); return; }

  const item = { id: nextId++, product, qty };
  cartItems.push(item);
  renderCart();
  updateTotals();
  codeInput.value = ''; qtyInput.value = '1'; productPreview.textContent = ''; codeInput.focus();
  showToast(`"${product.desc || code}" adicionado!`, 'success');
});

// ─── Cart Rendering ──────────────────────────────────────────────────────────
function renderCart() {
  const hasItems = cartItems.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  totalsPanel.hidden = !hasItems;
  productsList.innerHTML = '';
  for (const item of cartItems) productsList.appendChild(buildProductCard(item));
}

function buildProductCard(item) {
  const { id, product: p, qty } = item;
  const hasDims = p.x !== null && p.y !== null && p.z !== null;
  const hasPeso = p.peso !== null;
  const card = document.createElement('div');
  card.className = 'product-card';
  card.setAttribute('data-id', id);
  const { vol, wt } = calcItem(p, qty);
  card.innerHTML = `
    <div class="card-header">
      <div>
        <span class="card-code">Cód. ${escHtml(p.code)}</span>
        <div class="card-name">${escHtml(p.desc || '(sem descrição)')}</div>
      </div>
      <button class="card-remove-btn" aria-label="Remover" data-remove-id="${id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="card-dims">
      ${buildDimBadge('X (cm)', p.x)} ${buildDimBadge('Y (cm)', p.y)} ${buildDimBadge('Z (cm)', p.z)}
      ${buildDimBadge('Peso/cx', p.peso !== null ? `${fmtNum(p.peso)} kg` : null)}
    </div>
    <div class="card-meta">
      ${buildMetaItem('Lote', p.lote)} ${buildMetaItem('GTIN-14', p.gtin)}
    </div>
    ${!hasDims ? `<div class="no-cubagem-warn">⚠ Dimensões não disponíveis.</div>` : ''}
    <div class="card-calc">
      <div class="calc-qty-wrapper" data-qty="${qty}">
        <span class="calc-qty-label">Caixas:</span>
        <input type="number" class="calc-qty-input" data-item-id="${id}" value="${qty}" min="1" step="1" />
      </div>
      <div class="calc-result">
        <span class="calc-result-label">Volume</span>
        <span class="calc-vol" data-vol="${id}">${hasDims ? fmtVol(vol) : '—'}</span>
        <span class="calc-wt" data-wt="${id}">${hasPeso ? fmtPeso(wt) : '—'}</span>
      </div>
    </div>
  `;
  card.querySelector('[data-remove-id]').addEventListener('click', () => removeItem(id));
  card.querySelector('.calc-qty-input').addEventListener('input', (e) => {
    const newQty = Math.max(1, parseInt(e.target.value, 10) || 1);
    e.target.value = newQty;
    e.target.closest('.calc-qty-wrapper').setAttribute('data-qty', newQty);
    updateItemQty(id, newQty);
  });
  return card;
}

function buildDimBadge(label, value) {
  const hasVal = value !== null && value !== undefined && value !== '';
  return `<div class="dim-badge${hasVal ? '' : ' no-data'}"><span class="dim-label">${label}</span><span class="dim-value">${hasVal ? (typeof value === 'number' ? fmtNum(value) : value) : '—'}</span></div>`;
}

function buildMetaItem(label, value) {
  const hasVal = value && value !== '';
  return `<div class="meta-item${hasVal ? '' : ' no-data'}"><span class="meta-label">${label}</span><span class="meta-value">${hasVal ? escHtml(value) : '—'}</span></div>`;
}

function calcItem(p, qty) {
  const hasDims = p.x !== null && p.y !== null && p.z !== null;
  return { vol: hasDims ? (p.x / 100) * (p.y / 100) * (p.z / 100) * qty : 0, wt: p.peso !== null ? p.peso * qty : 0 };
}

function removeItem(id) { cartItems = cartItems.filter(i => i.id !== id); renderCart(); updateTotals(); }

function updateItemQty(id, qty) {
  const item = cartItems.find(i => i.id === id); if (!item) return;
  item.qty = qty;
  const { vol, wt } = calcItem(item.product, qty);
  const vEl = document.querySelector(`[data-vol="${id}"]`), wEl = document.querySelector(`[data-wt="${id}"]`);
  if (vEl) vEl.textContent = item.product.x !== null ? fmtVol(vol) : '—';
  if (wEl) wEl.textContent = item.product.peso !== null ? fmtPeso(wt) : '—';
  updateTotals();
}

function updateTotals() {
  let v=0, w=0, b=0; for (const i of cartItems) { const { vol, wt } = calcItem(i.product, i.qty); v+=vol; w+=wt; b+=i.qty; }
  totalItems.textContent = cartItems.length; totalBoxes.textContent = b.toLocaleString('pt-BR');
  totalVolume.textContent = fmtVol(v); totalWeight.textContent = fmtPeso(w);
}

clearAllBtn.addEventListener('click', () => { cartItems = []; renderCart(); updateTotals(); showToast('Lista limpa.', 'success'); });

printBtn.addEventListener('click', () => {
  if (cartItems.length === 0) { showToast('Adicione produtos primeiro.', 'error'); return; }
  printOrderNum.textContent = orderNumInput.value.trim() || '—';
  printCustomerName.textContent = customerNameInput.value.trim() || '—';
  const now = new Date();
  printTimestamp.textContent = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  window.print();
});

exportExcelBtn.addEventListener('click', () => {
  if (cartItems.length === 0) { showToast('Adicione produtos primeiro.', 'error'); return; }
  
  const orderNum = orderNumInput.value.trim() || 'Sem_Numero';
  const customer = customerNameInput.value.trim() || 'Sem_Cliente';
  const filename = `Pedido_${orderNum}_${customer.replace(/\s+/g, '_')}.csv`;

  // Excel-friendly CSV: BOM + semicolon separator (common in BR/Europe)
  let csv = '\ufeff'; // BOM for UTF-8
  csv += 'Codigo;Descricao;Quantidade;Volume_m3;Peso_kg;Lote;GTIN\n';

  cartItems.forEach(item => {
    const { vol, wt } = calcItem(item.product, item.qty);
    csv += `${item.product.code};"${item.product.desc}";${item.qty};${vol.toFixed(3).replace('.',',')};${wt.toFixed(2).replace('.',',')};${item.product.lote};${item.product.gtin}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Excel/CSV exportado!', 'success');
});

// ─── Order Management & Supabase Sync ───────────────────────────────────────
async function saveOrder() {
  const orderNum = orderNumInput.value.trim();
  const customerName = customerNameInput.value.trim();
  if (cartItems.length === 0) { showToast('Adicione produtos antes de salvar.', 'error'); return; }

  const savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
  const newOrder = {
    id: Date.now(),
    orderNum: orderNum || 'Sem Número',
    customerName: customerName || 'Sem Cliente',
    items: JSON.parse(JSON.stringify(cartItems)),
    timestamp: new Date().toISOString()
  };

  savedOrders.unshift(newOrder);
  localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(savedOrders));
  renderSavedOrders();
  showToast('Pedido salvo localmente!', 'success');

  // Supabase Sync
  if (supabase) {
    setSyncStatus('syncing');
    try {
      const { error } = await supabase.from('cxb_orders').insert([{
        id: newOrder.id,
        order_num: newOrder.orderNum,
        customer_name: newOrder.customerName,
        items: newOrder.items,
        created_at: newOrder.timestamp
      }]);
      if (error) throw error;
      setSyncStatus('synced');
    } catch (err) {
      console.error('Supabase sync error:', err);
      setSyncStatus('error');
    }
  }
}

async function renderSavedOrders() {
  const localOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
  let displayOrders = [...localOrders];

  // Supabase Sync: Fetch and Merge
  if (supabase) {
     setSyncStatus('syncing');
     try {
       const { data, error } = await supabase.from('cxb_orders').select('*').order('created_at', { ascending: false }).limit(50);
       if (error) throw error;
       
       if (data) {
         // Create a map of IDs for quick lookup
         const localIds = new Set(localOrders.map(o => o.id));
         
         const cloudOrders = data.map(d => ({
           id: d.id,
           orderNum: d.order_num,
           customerName: d.customer_name,
           items: d.items,
           timestamp: d.created_at,
           status: d.status || 'Pendente' // Future-proofing
         }));

         // Merge: Add cloud orders that are not in local
         let merged = [...localOrders];
         cloudOrders.forEach(co => {
           if (!localIds.has(co.id)) {
             merged.push(co);
           }
         });
         
         // Sort by timestamp descending
         merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
         displayOrders = merged;
         
         // Update local storage to keep it in sync
         localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(displayOrders));
       }
       setSyncStatus('synced');
     } catch (err) {
       console.error('Supabase fetch error:', err);
       setSyncStatus('error');
     }
  }

  const hasOrders = displayOrders.length > 0;
  savedOrdersSection.hidden = !hasOrders;
  savedOrdersCount.textContent = displayOrders.length;
  savedOrdersList.innerHTML = '';

  displayOrders.forEach(order => {
    const d = new Date(order.timestamp);
    const dateStr = d.toLocaleDateString('pt-BR');
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const card = document.createElement('div');
    card.className = 'saved-order-card';
    card.innerHTML = `
      <div class="saved-order-info">
        <div class="saved-order-top">
          <div class="saved-order-title">Pedido: ${escHtml(order.orderNum)}</div>
          <span class="status-badge" data-status="${order.status || 'Pendente'}">${order.status || 'Pendente'}</span>
        </div>
        <div class="saved-order-client">Cliente: ${escHtml(order.customerName)}</div>
      </div>
      <div class="saved-order-meta"><span>${dateStr} às ${timeStr}</span><span>${order.items.length} itens</span></div>
      <div class="saved-order-actions">
        <button class="btn-small btn-small-open" data-open-id="${order.id}">Abrir</button>
        <button class="btn-small btn-small-delete" data-delete-id="${order.id}">Deletar</button>
      </div>
    `;
    card.querySelector(`[data-open-id="${order.id}"]`).addEventListener('click', () => openOrder(order.id));
    card.querySelector(`[data-delete-id="${order.id}"]`).addEventListener('click', () => deleteOrder(order.id));
    savedOrdersList.appendChild(card);
  });
}

function openOrder(id) {
  const savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
  const order = savedOrders.find(o => o.id === id);
  if (!order) { showToast('Pedido não encontrado.', 'error'); return; }
  cartItems = JSON.parse(JSON.stringify(order.items));
  orderNumInput.value = order.orderNum === 'Sem Número' ? '' : order.orderNum;
  customerNameInput.value = order.customerName === 'Sem Cliente' ? '' : order.customerName;
  renderCart(); updateTotals();
  document.querySelector('.search-section').scrollIntoView({ behavior: 'smooth' });
  showToast(`Pedido "${order.orderNum}" carregado!`, 'success');
}

async function deleteOrder(id) {
  if (!confirm('Excluir este pedido?')) return;
  const savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
  const filtered = savedOrders.filter(o => o.id !== id);
  localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(filtered));
  renderSavedOrders();
  showToast('Pedido removido localmente.', 'success');

  if (supabase) {
    try {
      await supabase.from('cxb_orders').delete().eq('id', id);
    } catch (err) {
      console.error('Supabase delete error:', err);
    }
  }
}

function setSyncStatus(state) {
  if (!syncStatus) return;
  syncStatus.className = `sync-status ${state}`;
}

saveOrderBtn.addEventListener('click', saveOrder);

// ─── Formatting & Utils ──────────────────────────────────────────────────────
function fmtNum(n) { return n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtVol(v) { return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³`; }
function fmtPeso(w) { return `${w.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`; }
function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg; toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { toast.className = `toast ${type}`; }, 3000);
}

// ─── Init ────────────────────────────────────────────────────────────────────
initSupabase();
loadData();
renderSavedOrders();
