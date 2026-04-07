/** CentraLu Xbox - Application Logic */
'use strict';

// Wrap everything to catch any errors
(function() {
  console.log('[CXB] Script start');

  // --- Constants ---
  var SHEET_ID = '1fRqUo8vH4awjCwV12U0fhR2bdBSRGFUVMlU8PozUsoQ';
  var SHEET_GID = '0';
  var SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMv8S8L3R_B_q-9v1-i9-8-i-8-i-8-i-8-i-8-i-8-i-8-i-8/pub?gid=0&single=true&output=csv'; // This will likely fall back to JSONP unless the new sheet is published

  var SUPABASE_URL = 'https://fruwdnbysjpaccregbnj.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZydXdkbmJ5c2pwYWNjcmVnYm5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjM3NTIsImV4cCI6MjA4OTY5OTc1Mn0.l7R4DGuXTKIxtDPWGfGvKCLHPIXWt8jTYoN-8eeys34';
  var COL = { CODE: 0, DESC: 1, X_CM: 15, Y_CM: 16, Z_CM: 17, PESO: 18, LOTE: 19, GTIN: 20 };
  var HEADER_ROWS = 3;
  var SAVED_ORDERS_KEY = 'cxb-saved-orders';

  // --- State ---
  var productDB = new Map();
  var cartItems = [];
  var nextId = 1;
  var supabase = null;

  // --- DOM refs (will be populated on DOMContentLoaded) ---
  var themeToggle, dataStatus, statusText, searchForm, codeInput, qtyInput;
  var orderNumInput, customerNameInput, codeError, productPreview;
  var emptyState, productsList, totalsPanel, totalItems, totalBoxes;
  var totalVolume, totalWeight, printBtn, clearAllBtn, toast;
  var printHeader, printOrderNum, printCustomerName, printTimestamp;
  var saveOrderBtn, savedOrdersSection, savedOrdersCount, savedOrdersList;
  var syncStatus, exportExcelBtn;

  // --- Utils ---
  function fmtNum(n) {
    return n == null ? '\u2014' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtVol(v) {
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' m\u00B3';
  }
  function fmtPeso(w) {
    return w.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
  }
  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var toastTimer;
  function showToast(msg, type) {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = 'toast ' + (type || '') + ' show';
    toastTimer = setTimeout(function() { toast.className = 'toast ' + (type || ''); }, 3000);
  }

  function setStatus(type, text) {
    if (!dataStatus) return;
    dataStatus.className = 'data-status ' + type;
    if (statusText) statusText.textContent = text;
  }

  function setSyncStatus(state) {
    if (!syncStatus) return;
    syncStatus.className = 'sync-status ' + state;
  }

  function parseNum(val) {
    if (!val) return null;
    var s = String(val).trim().replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parsePeso(val) {
    if (!val) return null;
    var s = String(val).replace(/[^\d,.]/g, '').trim().replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // --- CSV Parser ---
  function parseCSVRows(text) {
    var rows = [];
    var row = [];
    var col = '';
    var inQuote = false;
    var i = 0;
    while (i < text.length) {
      var ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (text[i + 1] === '"') { col += '"'; i += 2; continue; }
          inQuote = false;
        } else { col += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ',') { row.push(col); col = ''; }
        else if (ch === '\r' && text[i + 1] === '\n') { row.push(col); col = ''; rows.push(row); row = []; i += 2; continue; }
        else if (ch === '\n' || ch === '\r') { row.push(col); col = ''; rows.push(row); row = []; }
        else { col += ch; }
      }
      i++;
    }
    if (col !== '' || row.length > 0) { row.push(col); rows.push(row); }
    return rows;
  }

  // --- Data Loading via JSONP (bypasses CORS) ---
  function loadViaJSONP() {
    return new Promise(function(resolve, reject) {
      var cbName = '__gvizCb_' + Date.now();
      var timer = setTimeout(function() {
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error('JSONP timeout'));
      }, 15000);

      window[cbName] = function(data) {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          var table = data.table;
          var rows = table.rows.map(function(r) {
            return r.c.map(function(cell) {
              return (cell && cell.v != null) ? String(cell.v) : '';
            });
          });
          resolve(rows);
        } catch (e) {
          reject(e);
        }
      };

      var url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
                '/gviz/tq?tq=select%20*&gid=' + SHEET_GID +
                '&tqx=out:json;responseHandler:' + cbName;
      var script = document.createElement('script');
      script.src = url;
      script.onerror = function() {
        clearTimeout(timer);
        delete window[cbName];
        reject(new Error('JSONP script load error'));
      };
      document.head.appendChild(script);
    });
  }

  // --- Data Loading via Published CSV ---
  function loadViaCSV() {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('CSV timeout')); }, 10000);
      fetch(SHEET_URL, { cache: 'no-store' })
        .then(function(res) {
          clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function(text) {
          var rows = parseCSVRows(text); // Return all rows to allow header detection
          resolve(rows);
        })
        .catch(function(err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // --- Main Data Loader ---
  function loadData() {
    setStatus('loading', 'Carregando dados...');
    console.log('[CXB] loadData: starting...');

    var p = loadViaJSONP().catch(function(err) {
      console.warn('[CXB] JSONP failed:', err.message, '- trying CSV...');
      return loadViaCSV();
    });

    p.then(function(rows) {
      if (!rows || rows.length === 0) throw new Error('No data received');

      // --- Dynamic Column Mapping ---
      // We search for the row that contains 'Cod.' or 'X (CM)'
      var headerRowIndex = -1;
      for (var i = 0; i < Math.min(rows.length, 15); i++) {
        var r = rows[i];
        if (!r) continue;
        var joined = r.join('|').toUpperCase();
        if (joined.indexOf('COD') !== -1 || joined.indexOf('X (CM)') !== -1) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex !== -1) {
        var h = rows[headerRowIndex];
        console.log('[CXB] Header row found at index', headerRowIndex, h);
        
        // Define standard positions based on screenshot
        // A=0, P=15, Q=16, R=17, S=18, T=19, U=20
        var map = { CODE: 0, DESC: 1, X_CM: 15, Y_CM: 16, Z_CM: 17, PESO: 18, LOTE: 19, GTIN: 20 };
        
        // Let's also try to see if they are elsewhere just in case
        for (var j = 0; j < h.length; j++) {
          var val = String(h[j]).toUpperCase().trim();
          if (val === 'X (CM)') map.X_CM = j;
          else if (val === 'Y (CM)') map.Y_CM = j;
          else if (val === 'Z (CM)') map.Z_CM = j;
          else if (val.indexOf('PESO') !== -1) map.PESO = j;
          else if (val.indexOf('COD') !== -1) map.CODE = j;
          else if (val.indexOf('DESC') !== -1) map.DESC = j;
          else if (val.indexOf('LOTE') !== -1) map.LOTE = j;
          else if (val.indexOf('GTIN') !== -1) map.GTIN = j;
        }
        COL = map;
        console.log('[CXB] Final Mapped columns:', COL);
        // Data starts after header
        rows = rows.slice(headerRowIndex + 1);
      } else {
        console.warn('[CXB] Header row not found, using fixed defaults.');
        // Fallback for cases without clear headers
        if (rows.length > 0 && rows[0][0] && isNaN(Number(rows[0][0]))) {
          rows = rows.slice(1);
        }
      }

      productDB.clear();
      for (var k = 0; k < rows.length; k++) {
        var row = rows[k];
        var code = (row[COL.CODE] || '').trim();
        if (!code || isNaN(Number(code))) continue;
        if (!productDB.has(code)) {
          productDB.set(code, {
            code: code,
            desc: (row[COL.DESC] || '').trim(),
            x: parseNum(row[COL.X_CM]),
            y: parseNum(row[COL.Y_CM]),
            z: parseNum(row[COL.Z_CM]),
            peso: parsePeso(row[COL.PESO]),
            lote: (row[COL.LOTE] || '').trim(),
            gtin: (row[COL.GTIN] || '').trim()
          });
        }
      }
      var count = productDB.size;
      if (count === 0) throw new Error('No products found');
      console.log('[CXB] Loaded ' + count + ' products');
      setStatus('ready', count + ' produtos carregados');
      showToast('Dados carregados: ' + count + ' produtos', 'success');
    })
    .catch(function(err) {
      console.error('[CXB] Load error:', err);
      setStatus('error', 'Erro ao carregar dados');
      showToast('Erro ao carregar dados da planilha.', 'error');
    });
  }

  // --- Cart ---
  function calcItem(p, qty) {
    var hasDims = p.x !== null && p.y !== null && p.z !== null;
    return {
      vol: hasDims ? (p.x / 100) * (p.y / 100) * (p.z / 100) * qty : 0,
      wt: p.peso !== null ? p.peso * qty : 0
    };
  }

  function renderCart() {
    var hasItems = cartItems.length > 0;
    if (emptyState) emptyState.style.display = hasItems ? 'none' : '';
    if (totalsPanel) totalsPanel.hidden = !hasItems;
    if (productsList) {
      productsList.innerHTML = '';
      for (var i = 0; i < cartItems.length; i++) {
        productsList.appendChild(buildProductCard(cartItems[i]));
      }
    }
  }

  function buildDimBadge(label, value) {
    var hasVal = value !== null && value !== undefined && value !== '';
    return '<div class="dim-badge' + (hasVal ? '' : ' no-data') + '"><span class="dim-label">' + label + '</span><span class="dim-value">' + (hasVal ? (typeof value === 'number' ? fmtNum(value) : value) : '\u2014') + '</span></div>';
  }

  function buildMetaItem(label, value) {
    var hasVal = value && value !== '';
    return '<div class="meta-item' + (hasVal ? '' : ' no-data') + '"><span class="meta-label">' + label + '</span><span class="meta-value">' + (hasVal ? escHtml(value) : '\u2014') + '</span></div>';
  }

  function buildProductCard(item) {
    var id = item.id, p = item.product, qty = item.qty;
    var hasDims = p.x !== null && p.y !== null && p.z !== null;
    var hasPeso = p.peso !== null;
    var result = calcItem(p, qty);
    var card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', id);
    card.innerHTML =
      '<div class="card-header">' +
        '<div>' +
          '<span class="card-code">C\u00F3d. ' + escHtml(p.code) + '</span>' +
          '<div class="card-name">' + escHtml(p.desc || '(sem descri\u00E7\u00E3o)') + '</div>' +
        '</div>' +
        '<button class="card-remove-btn" aria-label="Remover" data-remove-id="' + id + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="card-dims">' +
        buildDimBadge('X (cm)', p.x) + ' ' + buildDimBadge('Y (cm)', p.y) + ' ' + buildDimBadge('Z (cm)', p.z) +
        buildDimBadge('Peso/cx', p.peso !== null ? fmtNum(p.peso) + ' kg' : null) +
      '</div>' +
      '<div class="card-calc">' +
        '<div class="calc-qty-wrapper" data-qty="' + qty + '">' +
          '<span class="calc-qty-label">Caixas:</span>' +
          '<input type="number" class="calc-qty-input" data-item-id="' + id + '" value="' + qty + '" min="1" step="1" />' +
        '</div>' +
        '<div class="calc-result">' +
          '<span class="calc-result-label">Volume</span>' +
          '<span class="calc-vol" data-vol="' + id + '">' + (hasDims ? fmtVol(result.vol) : '\u2014') + '</span>' +
          '<span class="calc-wt" data-wt="' + id + '">' + (hasPeso ? fmtPeso(result.wt) : '\u2014') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="card-meta">' +
        buildMetaItem('Lote', p.lote) + ' ' + buildMetaItem('GTIN-14', p.gtin) +
      '</div>' +
      (!hasDims ? '<div class="no-cubagem-warn">\u26A0 Dimens\u00F5es n\u00E3o dispon\u00EDveis.</div>' : '');

    card.querySelector('[data-remove-id]').addEventListener('click', function() { removeItem(id); });
    card.querySelector('.calc-qty-input').addEventListener('input', function(e) {
      var newQty = Math.max(1, parseInt(e.target.value, 10) || 1);
      e.target.value = newQty;
      e.target.closest('.calc-qty-wrapper').setAttribute('data-qty', newQty);
      updateItemQty(id, newQty);
    });
    return card;
  }

  function removeItem(id) {
    cartItems = cartItems.filter(function(i) { return i.id !== id; });
    renderCart();
    updateTotals();
  }

  function updateItemQty(id, qty) {
    var item = cartItems.find(function(i) { return i.id === id; });
    if (!item) return;
    item.qty = qty;
    var result = calcItem(item.product, qty);
    var vEl = document.querySelector('[data-vol="' + id + '"]');
    var wEl = document.querySelector('[data-wt="' + id + '"]');
    if (vEl) vEl.textContent = item.product.x !== null ? fmtVol(result.vol) : '\u2014';
    if (wEl) wEl.textContent = item.product.peso !== null ? fmtPeso(result.wt) : '\u2014';
    updateTotals();
  }

  function updateTotals() {
    var v = 0, w = 0, b = 0;
    for (var i = 0; i < cartItems.length; i++) {
      var result = calcItem(cartItems[i].product, cartItems[i].qty);
      v += result.vol;
      w += result.wt;
      b += cartItems[i].qty;
    }
    if (totalItems) totalItems.textContent = cartItems.length;
    if (totalBoxes) totalBoxes.textContent = b.toLocaleString('pt-BR');
    if (totalVolume) totalVolume.textContent = fmtVol(v);
    if (totalWeight) totalWeight.textContent = fmtPeso(w);
  }

  // --- Order Management ---
  function saveOrder() {
    var orderNum = orderNumInput ? orderNumInput.value.trim() : '';
    var customerName = customerNameInput ? customerNameInput.value.trim() : '';
    if (cartItems.length === 0) { showToast('Adicione produtos antes de salvar.', 'error'); return; }

    var savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
    var newOrder = {
      id: Date.now(),
      orderNum: orderNum || 'Sem N\u00FAmero',
      customerName: customerName || 'Sem Cliente',
      items: JSON.parse(JSON.stringify(cartItems)),
      timestamp: new Date().toISOString()
    };

    savedOrders.unshift(newOrder);
    localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(savedOrders));
    renderSavedOrders();
    showToast('Pedido salvo!', 'success');

    if (supabase) {
      setSyncStatus('syncing');
      supabase.from('cxb_orders').insert([{
        id: newOrder.id,
        order_num: newOrder.orderNum,
        customer_name: newOrder.customerName,
        items: newOrder.items,
        created_at: newOrder.timestamp
      }]).then(function(res) {
        if (res.error) { console.error('Supabase insert error:', res.error); setSyncStatus('error'); }
        else { setSyncStatus('synced'); }
      }).catch(function(err) { console.error('Supabase sync error:', err); setSyncStatus('error'); });
    }
  }

  function renderSavedOrders() {
    var localOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
    var displayOrders = localOrders.slice();

    function render(orders) {
      var hasOrders = orders.length > 0;
      if (savedOrdersSection) savedOrdersSection.hidden = !hasOrders;
      if (savedOrdersCount) savedOrdersCount.textContent = orders.length;
      if (!savedOrdersList) return;
      savedOrdersList.innerHTML = '';

      orders.forEach(function(order) {
        var d = new Date(order.timestamp);
        var dateStr = d.toLocaleDateString('pt-BR');
        var timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var card = document.createElement('div');
        card.className = 'saved-order-card';
        card.innerHTML =
          '<div class="saved-order-info">' +
            '<div class="saved-order-top">' +
              '<div class="saved-order-title">Pedido: ' + escHtml(order.orderNum) + '</div>' +
              '<span class="status-badge" data-status="' + (order.status || 'Pendente') + '">' + (order.status || 'Pendente') + '</span>' +
            '</div>' +
            '<div class="saved-order-client">Cliente: ' + escHtml(order.customerName) + '</div>' +
          '</div>' +
          '<div class="saved-order-meta"><span>' + dateStr + ' \u00E0s ' + timeStr + '</span><span>' + order.items.length + ' itens</span></div>' +
          '<div class="saved-order-actions">' +
            '<button class="btn-small btn-small-open" data-open-id="' + order.id + '">Abrir</button>' +
            '<button class="btn-small btn-small-delete" data-delete-id="' + order.id + '">Deletar</button>' +
          '</div>';
        card.querySelector('[data-open-id="' + order.id + '"]').addEventListener('click', function() { openOrder(order.id); });
        card.querySelector('[data-delete-id="' + order.id + '"]').addEventListener('click', function() { deleteOrder(order.id); });
        savedOrdersList.appendChild(card);
      });
    }

    // Try Supabase merge
    if (supabase) {
      setSyncStatus('syncing');
      supabase.from('cxb_orders').select('*').order('created_at', { ascending: false }).limit(50)
        .then(function(res) {
          if (res.error) throw res.error;
          if (res.data) {
            var localIds = new Set(localOrders.map(function(o) { return o.id; }));
            var merged = localOrders.slice();
            res.data.forEach(function(d) {
              if (!localIds.has(d.id)) {
                merged.push({
                  id: d.id, orderNum: d.order_num, customerName: d.customer_name,
                  items: d.items, timestamp: d.created_at, status: d.status || 'Pendente'
                });
              }
            });
            merged.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
            displayOrders = merged;
            localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(displayOrders));
          }
          setSyncStatus('synced');
          render(displayOrders);
        })
        .catch(function(err) {
          console.error('Supabase fetch error:', err);
          setSyncStatus('error');
          render(displayOrders);
        });
    } else {
      render(displayOrders);
    }
  }

  function openOrder(id) {
    var savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
    var order = savedOrders.find(function(o) { return o.id === id; });
    if (!order) { showToast('Pedido n\u00E3o encontrado.', 'error'); return; }
    cartItems = JSON.parse(JSON.stringify(order.items));
    if (orderNumInput) orderNumInput.value = order.orderNum === 'Sem N\u00FAmero' ? '' : order.orderNum;
    if (customerNameInput) customerNameInput.value = order.customerName === 'Sem Cliente' ? '' : order.customerName;
    renderCart();
    updateTotals();
    var searchSection = document.querySelector('.search-section');
    if (searchSection) searchSection.scrollIntoView({ behavior: 'smooth' });
    showToast('Pedido "' + order.orderNum + '" carregado!', 'success');
  }

  function deleteOrder(id) {
    if (!confirm('Excluir este pedido?')) return;
    var savedOrders = JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || '[]');
    var filtered = savedOrders.filter(function(o) { return o.id !== id; });
    localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(filtered));
    renderSavedOrders();
    showToast('Pedido removido.', 'success');

    if (supabase) {
      supabase.from('cxb_orders').delete().eq('id', id)
        .catch(function(err) { console.error('Supabase delete error:', err); });
    }
  }

  // --- Theme ---
  function initTheme() {
    var saved = localStorage.getItem('cxb-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    if (themeToggle) {
      themeToggle.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('cxb-theme', next);
      });
    }
  }

  // --- Supabase Init ---
  function initSupabase() {
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('[CXB] Supabase OK');
      } else {
        console.warn('[CXB] Supabase SDK not available');
      }
    } catch (err) {
      console.error('[CXB] Supabase error:', err);
      supabase = null;
    }
  }

  // --- Init (runs when DOM is ready) ---
  function init() {
    console.log('[CXB] DOM ready, initializing...');

    // Get DOM refs
    themeToggle = document.getElementById('themeToggle');
    dataStatus = document.getElementById('dataStatus');
    statusText = dataStatus ? dataStatus.querySelector('.status-text') : null;
    searchForm = document.getElementById('searchForm');
    codeInput = document.getElementById('codeInput');
    qtyInput = document.getElementById('qtyInput');
    orderNumInput = document.getElementById('orderNumInput');
    customerNameInput = document.getElementById('customerNameInput');
    codeError = document.getElementById('codeError');
    productPreview = document.getElementById('productPreview');
    emptyState = document.getElementById('emptyState');
    productsList = document.getElementById('productsList');
    totalsPanel = document.getElementById('totalsPanel');
    totalItems = document.getElementById('totalItems');
    totalBoxes = document.getElementById('totalBoxes');
    totalVolume = document.getElementById('totalVolume');
    totalWeight = document.getElementById('totalWeight');
    printBtn = document.getElementById('printBtn');
    clearAllBtn = document.getElementById('clearAllBtn');
    toast = document.getElementById('toast');
    printHeader = document.getElementById('printHeader');
    printOrderNum = document.getElementById('printOrderNum');
    printCustomerName = document.getElementById('printCustomerName');
    printTimestamp = document.getElementById('printTimestamp');
    saveOrderBtn = document.getElementById('saveOrderBtn');
    savedOrdersSection = document.getElementById('savedOrdersSection');
    savedOrdersCount = document.getElementById('savedOrdersCount');
    savedOrdersList = document.getElementById('savedOrdersList');
    syncStatus = document.getElementById('syncStatus');
    exportExcelBtn = document.getElementById('exportExcelBtn');

    console.log('[CXB] DOM refs acquired');

    // Theme
    initTheme();

    // Supabase
    initSupabase();

    // Event listeners
    if (codeInput) {
      codeInput.addEventListener('input', function() {
        if (codeError) codeError.textContent = '';
        var val = codeInput.value.toLowerCase().trim();
        if (!val) { if (productPreview) productPreview.textContent = ''; return; }
        var p = productDB.get(val);
        if (!p) {
          var iter = productDB.values();
          var entry = iter.next();
          while (!entry.done) {
            if (entry.value.desc.toLowerCase().indexOf(val) !== -1) { p = entry.value; break; }
            entry = iter.next();
          }
        }
        if (productPreview) {
          if (p) {
            var hasDims = p.x !== null && p.y !== null && p.z !== null;
            var hasPeso = p.peso !== null;
            var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
            var result = calcItem(p, qty);
            productPreview.innerHTML =
              '<div class="preview-card">' +
                '<div class="preview-card-header">' +
                  '<span class="card-code">C\u00F3d. ' + escHtml(p.code) + '</span>' +
                  '<div class="card-name">' + escHtml(p.desc || '(sem descri\u00E7\u00E3o)') + '</div>' +
                '</div>' +
                '<div class="card-dims">' +
                  buildDimBadge('X (cm)', p.x) + ' ' +
                  buildDimBadge('Y (cm)', p.y) + ' ' +
                  buildDimBadge('Z (cm)', p.z) + ' ' +
                  buildDimBadge('Peso/cx', hasPeso ? fmtNum(p.peso) + ' kg' : null) +
                '</div>' +
                '<div class="card-calc">' +
                  '<div class="calc-result">' +
                    '<span class="calc-result-label">Volume</span>' +
                    '<span class="calc-vol">' + (hasDims ? fmtVol(result.vol) : '\u2014') + '</span>' +
                    '<span class="calc-wt">' + (hasPeso ? fmtPeso(result.wt) : '\u2014') + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="card-meta">' +
                  buildMetaItem('Lote', p.lote) + ' ' + buildMetaItem('GTIN-14', p.gtin) +
                '</div>' +
                (!hasDims ? '<div class="no-cubagem-warn">\u26A0 Dimens\u00F5es n\u00E3o dispon\u00EDveis.</div>' : '') +
              '</div>';
          } else {
            productPreview.textContent = '';
          }
        }
      });
    }

    if (searchForm) {
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        if (productDB.size === 0) { showToast('Dados ainda n\u00E3o carregados.', 'error'); return; }
        var val = codeInput ? codeInput.value.trim() : '';
        var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
        if (codeError) codeError.textContent = '';
        if (!val) { if (codeError) codeError.textContent = 'Informe um c\u00F3digo ou descri\u00E7\u00E3o.'; if (codeInput) codeInput.focus(); return; }

        var product = productDB.get(val);
        if (!product) {
          var iter = productDB.values();
          var entry = iter.next();
          while (!entry.done) {
            if (entry.value.desc.toLowerCase().indexOf(val.toLowerCase()) !== -1) { product = entry.value; break; }
            entry = iter.next();
          }
        }

        if (!product) { if (codeError) codeError.textContent = 'Produto "' + val + '" n\u00E3o encontrado.'; if (codeInput) codeInput.focus(); return; }
        if (qty < 1) { if (codeError) codeError.textContent = 'M\u00EDnimo: 1.'; if (qtyInput) qtyInput.focus(); return; }

        cartItems.push({ id: nextId++, product: product, qty: qty });
        renderCart();
        updateTotals();
        if (codeInput) { codeInput.value = ''; codeInput.focus(); }
        if (qtyInput) qtyInput.value = '1';
        if (productPreview) productPreview.textContent = '';
        showToast('"' + (product.desc || product.code) + '" adicionado!', 'success');
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function() {
        cartItems = [];
        renderCart();
        updateTotals();
        showToast('Lista limpa.', 'success');
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', function() {
        if (cartItems.length === 0) { showToast('Adicione produtos primeiro.', 'error'); return; }
        if (printOrderNum) printOrderNum.textContent = (orderNumInput ? orderNumInput.value.trim() : '') || '\u2014';
        if (printCustomerName) printCustomerName.textContent = (customerNameInput ? customerNameInput.value.trim() : '') || '\u2014';
        var now = new Date();
        if (printTimestamp) printTimestamp.textContent = now.toLocaleDateString('pt-BR') + ' \u00E0s ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        window.print();
      });
    }

    if (exportExcelBtn) {
      exportExcelBtn.addEventListener('click', function() {
        if (cartItems.length === 0) { showToast('A