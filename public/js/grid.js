/**
 * DataGrid - 재사용 가능한 데이터 그리드 컴포넌트
 * 기능: 정렬, 페이지네이션, 더블클릭, 엑셀 다운로드
 */
class DataGrid {
  constructor(options) {
    this.container   = typeof options.container === 'string'
      ? document.querySelector(options.container)
      : options.container;
    this.columns     = options.columns     || [];
    this.fetchUrl    = options.fetchUrl    || '';
    this.excelUrl    = options.excelUrl    || '';
    this.onRowDblClick = options.onRowDblClick || null;
    this.pageSize    = options.pageSize    || 10;
    this.currentPage = 1;
    this.totalCount  = 0;
    this.data        = [];
    this.sortCol     = null;
    this.sortDir     = 'asc';
    this.searchParams = {};
    this.gridId      = options.gridId || null;
    this.hiddenCols  = new Set();
    this.frozenKey   = null;  // 이 컬럼까지 좌측 고정
    this.alignMap    = {};    // {colKey: 'left'|'center'|'right'}
    this.widthMap    = {};    // {colKey: '120px'}  사용자 조정 폭 (계정별)
    if (this.gridId) {
      try {
        const saved = JSON.parse(localStorage.getItem('grid_cols_' + this.gridId) || '[]');
        if (Array.isArray(saved)) saved.forEach(k => this.hiddenCols.add(k));
      } catch {}
      try {
        const fk = localStorage.getItem('grid_freeze_' + this.gridId);
        if (fk) this.frozenKey = fk;
      } catch {}
      try {
        const al = JSON.parse(localStorage.getItem('grid_align_' + this.gridId) || '{}');
        if (al && typeof al === 'object') this.alignMap = al;
      } catch {}
      try {
        const wKey = 'grid_widths_' + (window.GRID_USER_ID || 'anon') + '_' + this.gridId;
        const w = JSON.parse(localStorage.getItem(wKey) || '{}');
        if (w && typeof w === 'object') this.widthMap = w;
      } catch {}
    }
    this._render();
  }

  // 저장된 순서대로 컬럼 키 배열 반환 (저장 안 된 새 컬럼은 끝에 추가)
  _columnOrder() {
    const allKeys = this.columns.map(c => c.key);
    if (!this.gridId) return allKeys;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('grid_order_' + this.gridId) || '[]'); } catch {}
    const ordered = (Array.isArray(saved) ? saved : []).filter(k => allKeys.includes(k));
    for (const k of allKeys) if (!ordered.includes(k)) ordered.push(k);
    return ordered;
  }
  _saveOrder(orderedKeys) {
    if (!this.gridId) return;
    try { localStorage.setItem('grid_order_' + this.gridId, JSON.stringify(orderedKeys)); } catch {}
  }
  // 저장된 순서 + 숨김 필터링 적용한 보이는 컬럼 목록
  _visibleColumns() {
    const map = {};
    this.columns.forEach(c => { map[c.key] = c; });
    return this._columnOrder().filter(k => !this.hiddenCols.has(k)).map(k => map[k]);
  }
  // 틀고정 정보: { keys: Set<frozenKey>, lefts: {key: pxOffset}, lastKey }
  _freezeInfo() {
    const vis = this._visibleColumns();
    const info = { keys: new Set(), lefts: {}, lastKey: null };
    if (!this.frozenKey) return info;
    const parseW = (w) => {
      if (!w) return 100;  // 폭 미지정 시 기본값
      const m = String(w).match(/(\d+)/);
      return m ? parseInt(m[1]) : 100;
    };
    let offset = 0;
    for (const c of vis) {
      info.keys.add(c.key);
      info.lefts[c.key] = offset;
      info.lastKey = c.key;
      if (c.key === this.frozenKey) break;
      offset += parseW(this._widthOf(c));
    }
    return info;
  }
  _alignOf(col) {
    return this.alignMap[col.key] || col.align || 'center';
  }
  _widthOf(col) {
    return this.widthMap[col.key] || col.width;
  }
  _saveWidths() {
    if (!this.gridId) return;
    try {
      const wKey = 'grid_widths_' + (window.GRID_USER_ID || 'anon') + '_' + this.gridId;
      localStorage.setItem(wKey, JSON.stringify(this.widthMap));
    } catch {}
  }
  _applyFreezeStyles(cell, col, info, isHeader) {
    if (!info.keys.has(col.key)) return;
    cell.classList.add('frozen-col');
    cell.style.left = info.lefts[col.key] + 'px';
    if (col.key === info.lastKey) cell.classList.add('frozen-last');
    if (isHeader) cell.classList.add('frozen-th');
  }

  // ── 렌더링 ──────────────────────────────────────────────────
  _render() {
    this.container.innerHTML = '';
    // Table wrapper
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.className = 'data-table';
    this.table = table;

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const freezeInfo = this._freezeInfo();
    for (const col of this._visibleColumns()) {
      const th = document.createElement('th');
      th.innerHTML = `${col.label}<span class="sort-icon"><span class="sort-icon-asc">▲</span><span class="sort-icon-desc">▼</span></span>`;
      const w = this._widthOf(col);
      if (w) th.style.width = w;
      th.style.textAlign = 'center';  // 헤더는 항상 가운데 정렬
      th.dataset.key = col.key;
      th.addEventListener('click', () => this._onSort(col.key, th));
      this._applyFreezeStyles(th, col, freezeInfo, true);
      // 폭 조정 핸들
      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      resizer.addEventListener('mousedown', (e) => this._startColResize(e, col, th));
      resizer.addEventListener('click', (e) => e.stopPropagation());
      th.appendChild(resizer);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    this.tbody = tbody;
    table.appendChild(tbody);
    wrap.appendChild(table);
    this.container.appendChild(wrap);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'grid-footer';

    const leftFoot = document.createElement('div');
    leftFoot.className = 'page-size-select';
    leftFoot.innerHTML = `
      <span>페이지당</span>
      <select id="gPageSize">
        <option value="10" ${this.pageSize===10?'selected':''}>10</option>
        <option value="25" ${this.pageSize===25?'selected':''}>25</option>
        <option value="50" ${this.pageSize===50?'selected':''}>50</option>
        <option value="100" ${this.pageSize===100?'selected':''}>100</option>
      </select>
      <span>건</span>
    `;
    leftFoot.querySelector('#gPageSize').addEventListener('change', e => {
      this.pageSize    = parseInt(e.target.value);
      this.currentPage = 1;
      this.load();
    });

    const rightFoot = document.createElement('div');
    rightFoot.className = 'pagination';
    this.paginationEl = rightFoot;

    const totalEl = document.createElement('div');
    totalEl.className = 'total-info';
    this.totalEl = totalEl;

    footer.appendChild(leftFoot);
    footer.appendChild(totalEl);
    footer.appendChild(rightFoot);
    this.container.appendChild(footer);
  }

  // ── 정렬 ────────────────────────────────────────────────────
  _onSort(key, th) {
    if (this.sortCol === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = key;
      this.sortDir = 'asc';
    }
    // Update header classes
    this.table.querySelectorAll('th').forEach(t => {
      t.classList.remove('sorted-asc', 'sorted-desc');
    });
    th.classList.add(this.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    this._sortData();
    this._renderBody();
  }

  _sortData() {
    if (!this.sortCol) return;
    const col = this.columns.find(c => c.key === this.sortCol);
    this.data.sort((a, b) => {
      let va = a[this.sortCol], vb = b[this.sortCol];
      if (col && col.sortType === 'number') { va = parseFloat(va)||0; vb = parseFloat(vb)||0; }
      else { va = String(va||''); vb = String(vb||''); }
      if (va < vb) return this.sortDir === 'asc' ? -1 : 1;
      if (va > vb) return this.sortDir === 'asc' ? 1  : -1;
      return 0;
    });
  }

  // ── 데이터 로드 ─────────────────────────────────────────────
  async load(extraParams) {
    if (extraParams) this.searchParams = extraParams;
    const params = new URLSearchParams({
      ...this.searchParams,
      page: this.currentPage,
      size: this.pageSize,
    });

    this.tbody.innerHTML = `<tr><td colspan="${this._visibleColumns().length}" style="text-align:center;padding:32px"><div class="spinner"></div></td></tr>`;

    try {
      const res  = await fetch(`${this.fetchUrl}?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || '오류');
      this.data       = json.data || [];
      this.totalCount = json.total || 0;
      if (this.sortCol) this._sortData();
      if (typeof this.postLoadTransform === 'function') {
        this.data = this.postLoadTransform(this.data);
      }
      this._renderBody();
      this._renderPagination();
      this.totalEl.textContent = `총 ${this.totalCount.toLocaleString()}건`;
      if (this.excelBtn) {
        this.excelBtn.disabled = this.totalCount === 0;
      }
    } catch(e) {
      this.tbody.innerHTML = `<tr><td colspan="${this._visibleColumns().length}" class="no-data"><span class="icon">📭</span>데이터를 불러올 수 없습니다.</td></tr>`;
    }
  }

  // ── 바디 렌더링 ─────────────────────────────────────────────
  _renderBody() {
    this.tbody.innerHTML = '';
    if (!this.data.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this._visibleColumns().length;
      td.className = 'no-data';
      td.innerHTML = '<span class="icon">📭</span>조회된 데이터가 없습니다.';
      tr.appendChild(td);
      this.tbody.appendChild(tr);
      return;
    }

    const bodyFreezeInfo = this._freezeInfo();
    for (const row of this.data) {
      const tr = document.createElement('tr');
      if (row._subtotal) tr.classList.add('subtotal-row');
      tr.dataset.id = row.id || '';
      for (const col of this._visibleColumns()) {
        const td = document.createElement('td');
        td.style.textAlign = this._alignOf(col);
        const raw = row[col.key];
        if (col.render) {
          const result = col.render(raw, row);
          if (typeof result === 'string') {
            td.innerHTML = result;
          } else {
            td.appendChild(result);
          }
        } else {
          td.textContent = raw !== null && raw !== undefined ? raw : '';
        }
        this._applyFreezeStyles(td, col, bodyFreezeInfo, false);
        tr.appendChild(td);
      }
      if (!row._subtotal) {
        tr.addEventListener('click', () => {
          this.tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
        });
        if (this.onRowDblClick) {
          tr.addEventListener('dblclick', () => this.onRowDblClick(row, tr));
        }
      }
      this.tbody.appendChild(tr);
    }
  }

  // ── 페이지네이션 ────────────────────────────────────────────
  _renderPagination() {
    const pages = Math.ceil(this.totalCount / this.pageSize) || 1;
    this.paginationEl.innerHTML = '';

    const mkBtn = (label, page, disabled, active) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (active ? ' active' : '');
      btn.textContent = label;
      btn.disabled    = disabled;
      btn.addEventListener('click', () => {
        this.currentPage = page;
        this.load();
      });
      return btn;
    };

    this.paginationEl.appendChild(mkBtn('◀◀', 1, this.currentPage === 1, false));
    this.paginationEl.appendChild(mkBtn('◀', this.currentPage - 1, this.currentPage === 1, false));

    const start = Math.max(1, this.currentPage - 2);
    const end   = Math.min(pages, start + 4);
    for (let p = start; p <= end; p++) {
      this.paginationEl.appendChild(mkBtn(p, p, false, p === this.currentPage));
    }

    this.paginationEl.appendChild(mkBtn('▶', this.currentPage + 1, this.currentPage >= pages, false));
    this.paginationEl.appendChild(mkBtn('▶▶', pages, this.currentPage >= pages, false));
  }

  // ── 엑셀 버튼 연결 ──────────────────────────────────────────
  bindExcelButton(btnEl) {
    this.excelBtn = typeof btnEl === 'string' ? document.querySelector(btnEl) : btnEl;
    if (!this.excelBtn) return;
    this.excelBtn.disabled = true;
    this.excelBtn.addEventListener('click', () => {
      const params = new URLSearchParams(this.searchParams);
      window.location.href = `${this.excelUrl}?${params}`;
    });
  }

  // ── 컬럼 폭 드래그 조정 ────────────────────────────────────
  _startColResize(e, col, th) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    const onMove = (ev) => {
      const newW = Math.max(40, Math.round(startW + ev.clientX - startX));
      th.style.width = newW + 'px';
      document.body.style.cursor = 'col-resize';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      const finalW = Math.round(th.getBoundingClientRect().width);
      this.widthMap[col.key] = finalW + 'px';
      this._saveWidths();
      // 바디/헤더 재렌더링 (틀고정 offset 등도 갱신)
      this._render();
      this._renderBody();
      this._renderPagination();
      if (this.totalEl) this.totalEl.textContent = `총 ${(this.totalCount||0).toLocaleString()}건`;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── 컬럼조정 외부 트리거 ─────────────────────────────────────
  openColumnPicker() { this._openColumnPicker(); }
  bindColumnPickerButton(elOrSelector) {
    const el = typeof elOrSelector === 'string' ? document.querySelector(elOrSelector) : elOrSelector;
    if (!el) return;
    el.addEventListener('click', () => this._openColumnPicker());
  }

  // ── 검색 ───────────────────────────────────────────────────
  search(params) {
    this.searchParams = params;
    this.currentPage  = 1;
    this.load();
  }

  // ── 컬럼 가시성 저장 ──────────────────────────────────────
  _saveVisibility() {
    if (!this.gridId) return;
    try { localStorage.setItem('grid_cols_' + this.gridId, JSON.stringify([...this.hiddenCols])); } catch {}
  }
  _applyVisibility() {
    this._saveVisibility();
    this._render();
    this._renderBody();
    this._renderPagination();
    if (this.totalEl) this.totalEl.textContent = `총 ${(this.totalCount||0).toLocaleString()}건`;
    if (this.excelBtn) this.excelBtn.disabled = !this.totalCount;
  }

  // ── 컬럼조정 모달 (체크박스 + 드래그 순서 변경) ───────────
  _openColumnPicker() {
    const ov = document.createElement('div');
    ov.className = 'overlay visible';
    ov.style.zIndex = '9800';
    const labelOf = c => {
      const raw = String(c.label || '');
      const stripped = raw.replace(/<br>[\s\S]*$/i, '').replace(/<[^>]+>/g, '').trim();
      return stripped || `(${c.key})`;
    };
    const colsByKey = {};
    this.columns.forEach(c => { colsByKey[c.key] = c; });
    const currentFreeze = this.frozenKey;
    // 정렬 아이콘 SVG (왼쪽/가운데/오른쪽)
    const ALIGN_ICONS = {
      left:   '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 2h12M1 5h8M1 8h12M1 11h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      center: '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 2h12M3 5h8M1 8h12M3 11h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      right:  '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 2h12M5 5h8M1 8h12M5 11h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    };
    const alignBtn = (key, align, cur) => {
      const active = cur === align;
      const tone = active ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : 'background:#fff;color:var(--gray-500)';
      return `<button type="button" data-align-key="${key}" data-align="${align}" title="${align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'} 정렬"
        style="border:1px solid var(--gray-200);border-radius:4px;padding:3px 5px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;${tone}">${ALIGN_ICONS[align]}</button>`;
    };
    const itemsHtml = this._columnOrder().map(k => {
      const c = colsByKey[k];
      if (!c || c.hideInPicker) return '';
      const isFrozen = (k === currentFreeze);
      const lockBg = isFrozen ? 'background:#fef9c3;color:#a16207;border-color:#facc15' : 'background:#fff;color:var(--gray-400)';
      const cur = this._alignOf(c);
      return `<label class="col-picker-item" draggable="true" data-col-key="${c.key}"
                style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--gray-200);border-radius:6px;background:#fff;cursor:grab">
         <span style="color:var(--gray-400);cursor:grab;user-select:none" title="드래그하여 순서 변경">⋮⋮</span>
         <input type="checkbox" data-col-key="${c.key}" ${!this.hiddenCols.has(c.key) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--primary)">
         <span style="font-size:13px">${labelOf(c)}</span>
         <span style="font-size:11px;color:var(--gray-400);font-family:monospace">${c.key}</span>
         <span style="margin-left:auto;display:inline-flex;gap:2px">${alignBtn(c.key,'left',cur)}${alignBtn(c.key,'center',cur)}${alignBtn(c.key,'right',cur)}</span>
         <button type="button" data-freeze-key="${c.key}"
           title="${isFrozen ? '틀고정 해제' : '이 컬럼까지 좌측 틀고정'}"
           style="border:1px solid var(--gray-200);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;min-width:64px;text-align:center;white-space:nowrap;${lockBg}">${isFrozen ? '🔒 고정됨' : '🔒 고정'}</button>
       </label>`;
    }).join('');
    ov.innerHTML = `
      <div class="overlay-dialog" style="max-width:480px;width:95%;display:flex;flex-direction:column;overflow:hidden">
        <div class="overlay-header" style="background:var(--primary);border-bottom:none;justify-content:center;position:relative;flex-shrink:0">
          <span class="overlay-title" style="color:#fff">컬럼 조정</span>
          <button class="overlay-close" style="position:absolute;right:20px;color:rgba(255,255,255,.85)">✕</button>
        </div>
        <div class="overlay-body" style="flex:1;min-height:0;overflow-y:auto;padding:16px 20px">
          <div style="font-size:12px;color:var(--gray-500);margin-bottom:10px">
            표시할 컬럼을 선택하고 <strong>⋮⋮ 핸들</strong>을 잡아 끌어서 순서를 바꿀 수 있습니다. 변경사항은 자동 저장됩니다.
          </div>
          <div id="colPickerList" style="display:flex;flex-direction:column;gap:6px">${itemsHtml}</div>
        </div>
        <div class="overlay-footer" style="flex-shrink:0;justify-content:space-between">
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" data-act="all">전체 선택</button>
            <button class="btn btn-ghost btn-sm" data-act="none">전체 해제</button>
          </div>
          <button class="btn btn-primary btn-sm" data-act="reset">기본값 (순서·표시 초기화)</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const list = ov.querySelector('#colPickerList');
    const close = () => ov.remove();
    ov.querySelector('.overlay-close').addEventListener('click', close);
    ov.addEventListener('click', e => { if (e.target === ov) close(); });

    // 체크박스: 가시성 토글
    ov.querySelectorAll('input[data-col-key]').forEach(cb => {
      cb.addEventListener('change', () => {
        const k = cb.dataset.colKey;
        if (cb.checked) this.hiddenCols.delete(k); else this.hiddenCols.add(k);
        this._applyVisibility();
      });
    });
    const setAll = (visible) => {
      this.columns.forEach(c => {
        if (visible) this.hiddenCols.delete(c.key); else this.hiddenCols.add(c.key);
      });
      ov.querySelectorAll('input[data-col-key]').forEach(cb => { cb.checked = visible; });
      this._applyVisibility();
    };
    ov.querySelector('[data-act="all"]').addEventListener('click',   () => setAll(true));
    ov.querySelector('[data-act="none"]').addEventListener('click',  () => setAll(false));
    ov.querySelector('[data-act="reset"]').addEventListener('click', () => {
      this.hiddenCols.clear();
      this.frozenKey = null;
      this.alignMap = {};
      this.widthMap = {};
      if (this.gridId) try {
        localStorage.removeItem('grid_freeze_' + this.gridId);
        localStorage.removeItem('grid_align_' + this.gridId);
        localStorage.removeItem('grid_widths_' + (window.GRID_USER_ID || 'anon') + '_' + this.gridId);
      } catch {}
      this._saveOrder(this.columns.map(c => c.key));
      close();
      this._applyVisibility();
      this._openColumnPicker();
    });

    // 틀고정 토글
    list.querySelectorAll('[data-freeze-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const k = btn.dataset.freezeKey;
        this.frozenKey = (this.frozenKey === k) ? null : k;
        if (this.gridId) try {
          if (this.frozenKey) localStorage.setItem('grid_freeze_' + this.gridId, this.frozenKey);
          else localStorage.removeItem('grid_freeze_' + this.gridId);
        } catch {}
        close();
        this._applyVisibility();
        this._openColumnPicker();
      });
    });

    // 정렬 변경
    list.querySelectorAll('[data-align-key]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const k = btn.dataset.alignKey;
        const a = btn.dataset.align;
        this.alignMap[k] = a;
        if (this.gridId) try { localStorage.setItem('grid_align_' + this.gridId, JSON.stringify(this.alignMap)); } catch {}
        close();
        this._applyVisibility();
        this._openColumnPicker();
      });
    });

    // 드래그 앤 드롭: 순서 변경
    let dragSrc = null;
    const updateOrder = () => {
      const order = [...list.querySelectorAll('.col-picker-item')].map(el => el.dataset.colKey);
      this._saveOrder(order);
      this._applyVisibility();
    };
    list.querySelectorAll('.col-picker-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        dragSrc = item;
        item.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.colKey);
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '';
        list.querySelectorAll('.col-picker-item').forEach(el => el.style.borderTop = el.style.borderBottom = '');
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc === item) return;
        const rect = item.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.querySelectorAll('.col-picker-item').forEach(el => el.style.borderTop = el.style.borderBottom = '1px solid var(--gray-200)');
        item.style[before ? 'borderTop' : 'borderBottom'] = '2px solid var(--primary)';
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        if (!dragSrc || dragSrc === item) return;
        const rect = item.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.insertBefore(dragSrc, before ? item : item.nextSibling);
        updateOrder();
      });
    });
  }
}

window.DataGrid = DataGrid;
