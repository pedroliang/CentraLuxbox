/**
 * CentraLu Xbox – Application Logic
 * Loads product data from Google Sheets CSV and provides
 * cubagem (volume) calculations for multiple products.
 */

// ─── Constants ─────────────────────────────────────────────────────────────
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1534KpKX7vCVz0W-FWezgHTSZqHcpy6-bG8vgGXAzUeM/export?format=csv&gid=0';

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

// The first 3 rows of the sheet are headers, skip them
const HEADER_ROWS = 3;

// ─── State ─────────────────────────────────────────────────────────────────
let productDB = new Map(); // code -> product object
let cartItems  = [];       // array of { id, product, qty }
let nextId     = 1;

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

// ─── CSV Loader ─────────────────────────────────────────────────────────────
async function loadData() {
  setStatus('loading', 'Carregando dados...');
  try {
    // Use a CORS proxy since Google Sheets export needs no auth but browser may block
    // We try direct first, then fall back to a proxy
    let csvText;
    try {
      const res = await fetch(SHEET_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('direct fetch failed');
      csvText = await res.text();
    } catch {
      // Fallback: allorigins proxy
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(SHEET_URL)}`;
      const res = await fetch(proxy);
      if (!res.ok) throw new Error('proxy fetch failed');
      csvText = await res.text();
    }

    parseCSV(csvText);
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
  dataStatus.className = `data-status ${type}`;
  statusText.textContent = text;
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = parseCSVRows(text);
  // Skip the 3 header rows
  const dataRows = rows.slice(HEADER_ROWS);

  productDB.clear();
  for (const row of dataRows) {
    const code = (row[COL.CODE] || '').trim();
    if (!code || isNaN(+code)) continue; // skip non-numeric or empty codes

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

    // Only store the first occurrence of a code to avoid duplicates
    if (!productDB.has(code)) {
      productDB.set(code, product);
    }
  }
}

/**
 * Full RFC-4180-compliant CSV parser handling quoted fields & embedded commas.
 */
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
        if (text[i + 1] === '"') { col += '"'; i += 2; continue; } // escaped quote
        inQuote = false;
      } else {
        col += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        row.push(col); col = '';
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(col); col = '';
        rows.push(row); row = [];
        i += 2; continue;
      } else if (ch === '\n' || ch === '\r') {
        row.push(col); col = '';
        rows.push(row); row = [];
      } else {
        col += ch;
      }
    }
    i++;
  }

  // last row
  if (col !== '' || row.length > 0) {
    row.push(col);
    rows.push(row);
  }
  return rows;
}

/** Parse a dimension string like "49,50" → 49.5 */
function parseNum(val) {
  if (!val) return null;
  const s = String(val).trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Parse peso string like "18,30 KG" → 18.30 */
function parsePeso(val) {
  if (!val) return null;
  const s = String(val).replace(/[^\d,.]/g, '').trim().replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Search / Preview ───────────────────────────────────────────────────────
codeInput.addEventListener('input', () => {
  codeError.textContent = '';
  const code = codeInput.value.trim();
  if (!code) { productPreview.textContent = ''; return; }

  if (productDB.size === 0) {
    productPreview.textContent = '';
    return;
  }

  const p = productDB.get(code);
  if (p) {
    productPreview.innerHTML = `✓ ${p.desc || 'Sem descrição'}`;
  } else {
    productPreview.textContent = '';
  }
});

// ─── Form Submit ─────────────────────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (productDB.size === 0) {
    showToast('Dados ainda não carregados. Aguarde.', 'error');
    return;
  }

  const code = codeInput.value.trim();
  const qty  = parseInt(qtyInput.value, 10) || 1;

  // Validate
  codeError.textContent = '';
  if (!code) { codeError.textContent = 'Informe um código.'; codeInput.focus(); return; }

  const product = productDB.get(code);
  if (!product) {
    codeError.textContent = `Código "${code}" não encontrado na planilha.`;
    codeInput.focus();
    return;
  }

  if (qty < 1) { codeError.textContent = 'Quantidade mínima: 1.'; qtyInput.focus(); return; }

  // Add to cart
  const item = { id: nextId++, product, qty };
  cartItems.push(item);

  renderCart();
  updateTotals();

  // Reset form
  codeInput.value = '';
  qtyInput.value = '1';
  productPreview.textContent = '';
  codeInput.focus();

  showToast(`"${product.desc || code}" adicionado!`, 'success');
});

// ─── Cart Rendering ──────────────────────────────────────────────────────────
function renderCart() {
  const hasItems = cartItems.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  totalsPanel.hidden = !hasItems;

  productsList.innerHTML = '';
  for (const item of cartItems) {
    productsList.appendChild(buildProductCard(item));
  }
}

function buildProductCard(item) {
  const { id, product: p, qty } = item;
  const hasDims = p.x !== null && p.y !== null && p.z !== null;
  const hasPeso = p.peso !== null;

  const card = document.createElement('div');
  card.className = 'product-card';
  card.setAttribute('data-id', id);
  card.setAttribute('role', 'listitem');

  const { vol, wt } = calcItem(p, qty);

  card.innerHTML = `
    <div class="card-header">
      <div>
        <span class="card-code">Cód. ${escHtml(p.code)}</span>
        <div class="card-name">${escHtml(p.desc || '(sem descrição)')}</div>
      </div>
      <button class="card-remove-btn" aria-label="Remover produto" data-remove-id="${id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="card-dims">
      ${buildDimBadge('X (cm)', p.x)}
      ${buildDimBadge('Y (cm)', p.y)}
      ${buildDimBadge('Z (cm)', p.z)}
      ${buildDimBadge('Peso/cx', p.peso !== null ? `${fmtNum(p.peso)} kg` : null)}
    </div>

    <div class="card-meta">
      ${buildMetaItem('Lote', p.lote)}
      ${buildMetaItem('GTIN-14', p.gtin)}
    </div>

    ${!hasDims ? `
    <div class="no-cubagem-warn">
      ⚠ Dimensões não disponíveis — cubagem não calculada.
    </div>` : ''}

    <div class="card-calc">
      <div class="calc-qty-wrapper">
        <span class="calc-qty-label">Caixas:</span>
        <input
          type="number"
          class="calc-qty-input"
          data-item-id="${id}"
          value="${qty}"
          min="1"
          step="1"
          aria-label="Quantidade de caixas"
        />
      </div>
      <div class="calc-result">
        <span class="calc-result-label">Volume</span>
        <span class="calc-vol" data-vol="${id}">${hasDims ? fmtVol(vol) : '—'}</span>
        <span class="calc-wt" data-wt="${id}">${hasPeso ? fmtPeso(wt) : '—'}</span>
      </div>
    </div>
  `;

  // Remove button
  card.querySelector('[data-remove-id]').addEventListener('click', () => {
    removeItem(id);
  });

  // Qty change
  card.querySelector('.calc-qty-input').addEventListener('input', (e) => {
    const newQty = Math.max(1, parseInt(e.target.value, 10) || 1);
    e.target.value = newQty;
    
    // Update data-qty for print CSS
    e.target.closest('.calc-qty-wrapper').setAttribute('data-qty', newQty);
    
    updateItemQty(id, newQty);
  });

  // Initial set for data-qty
  card.querySelector('.calc-qty-wrapper').setAttribute('data-qty', qty);

  return card;
}

function buildDimBadge(label, value) {
  const hasVal = value !== null && value !== undefined && value !== '';
  const displayVal = hasVal ? (typeof value === 'number' ? fmtNum(value) : value) : '—';
  return `
    <div class="dim-badge${hasVal ? '' : ' no-data'}">
      <span class="dim-label">${label}</span>
      <span class="dim-value">${displayVal}</span>
    </div>`;
}

function buildMetaItem(label, value) {
  const hasVal = value && value !== '';
  return `
    <div class="meta-item${hasVal ? '' : ' no-data'}">
      <span class="meta-label">${label}</span>
      <span class="meta-value">${hasVal ? escHtml(value) : '—'}</span>
    </div>`;
}

// ─── Calc Logic ──────────────────────────────────────────────────────────────
/**
 * Volume in m³: (X/100) × (Y/100) × (Z/100) × qty
 * Weight in kg:  peso_por_cx × qty
 */
function calcItem(p, qty) {
  const hasDims = p.x !== null && p.y !== null && p.z !== null;
  const vol = hasDims ? (p.x / 100) * (p.y / 100) * (p.z / 100) * qty : 0;
  const wt  = p.peso !== null ? p.peso * qty : 0;
  return { vol, wt };
}

// ─── Cart Operations ─────────────────────────────────────────────────────────
function removeItem(id) {
  cartItems = cartItems.filter(i => i.id !== id);
  renderCart();
  updateTotals();
}

function updateItemQty(id, qty) {
  const item = cartItems.find(i => i.id === id);
  if (!item) return;
  item.qty = qty;

  const { vol, wt } = calcItem(item.product, qty);
  const hasDims = item.product.x !== null && item.product.y !== null && item.product.z !== null;
  const hasPeso = item.product.peso !== null;

  const volEl = document.querySelector(`[data-vol="${id}"]`);
  const wtEl  = document.querySelector(`[data-wt="${id}"]`);
  if (volEl) volEl.textContent = hasDims ? fmtVol(vol) : '—';
  if (wtEl)  wtEl.textContent  = hasPeso ? fmtPeso(wt)  : '—';

  updateTotals();
}

function updateTotals() {
  let totalVol  = 0;
  let totalWt   = 0;
  let totalBxs  = 0;

  for (const item of cartItems) {
    const { vol, wt } = calcItem(item.product, item.qty);
    totalVol += vol;
    totalWt  += wt;
    totalBxs += item.qty;
  }

  totalItems.textContent  = cartItems.length;
  totalBoxes.textContent  = totalBxs.toLocaleString('pt-BR');
  totalVolume.textContent = fmtVol(totalVol);
  totalWeight.textContent = fmtPeso(totalWt);
}

clearAllBtn.addEventListener('click', () => {
  cartItems = [];
  renderCart();
  updateTotals();
  showToast('Lista limpa.', 'success');
});

// ─── Print Logic ─────────────────────────────────────────────────────────────
printBtn.addEventListener('click', () => {
  if (cartItems.length === 0) {
    showToast('Adicione produtos antes de imprimir.', 'error');
    return;
  }

  // Update print header info
  printOrderNum.textContent = orderNumInput.value.trim() || '—';
  printCustomerName.textContent = customerNameInput.value.trim() || '—';
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  printTimestamp.textContent = `${dateStr} às ${timeStr}`;

  window.print();
});

// ─── Formatting ──────────────────────────────────────────────────────────────
function fmtNum(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(v) {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³`;
}
function fmtPeso(w) {
  return `${w.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Toast ───────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { toast.className = `toast ${type}`; }, 3000);
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadData();
