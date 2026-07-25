/* ============================================================
 * 일정관리 달력 — ScheduleCalendar (월/주/일, 드래그 생성/리사이즈)
 * vanilla JS. MxAlert 사용. 쿠키 세션 인증(fetch).
 * window.initSchedule({role}) 로 대시보드 탭에서 초기화.
 * ============================================================ */
(function () {
  'use strict';

  // ── 날짜/시간 유틸 (로컬 wall-clock, UTC 변환 금지) ──────────
  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseYMD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeekSun(d) { return addDays(d, -d.getDay()); }
  function todayYMD() { return fmtDate(new Date()); }
  function minToTime(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
  function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function dtStr(ymd, min) { return `${ymd} ${minToTime(min)}:00`; }
  // 'YYYY-MM-DD HH:MM:SS' → {ymd, min}
  function splitDt(s) { return { ymd: s.slice(0, 10), min: timeToMin(s.slice(11, 16)) }; }
  // 숫자만 입력 → 검증/정규화. 'YYYYMMDD'→'YYYY-MM-DD', 'HHMM'/'HMM'→'HH:MM'. 실패 시 null
  function parseDateInput(raw) {
    if (raw == null) return null;
    const g = String(raw).replace(/\D/g, '');
    if (g.length !== 8) return null;
    const y = +g.slice(0, 4), m = +g.slice(4, 6), d = +g.slice(6, 8);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  function parseTimeInput(raw) {
    if (raw == null) return null;
    const g = String(raw).replace(/\D/g, '');
    let h, mi;
    if (g.length === 4) { h = +g.slice(0, 2); mi = +g.slice(2, 4); }
    else if (g.length === 3) { h = +g.slice(0, 1); mi = +g.slice(1, 3); }
    else if (g.length === 1 || g.length === 2) { h = +g; mi = 0; }
    else return null;
    if (h > 23 || mi > 59) return null;
    return `${pad(h)}:${pad(mi)}`;
  }
  // 연락처 포맷: 11자리→ddd-dddd-dddd, 10자리→dd(d)-ddd(d)-dddd, 그 외 원본
  function fmtPhone(raw) {
    if (!raw) return '';
    const d = String(raw).replace(/\D/g, '');
    if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (d.length === 10) return d.replace(/(\d{2,3})(\d{3,4})(\d{4})/, '$1-$2-$3');
    if (d.length === 8) return d.replace(/(\d{4})(\d{4})/, '$1-$2');
    return raw;
  }
  // 지난 시간대 여부 (로컬/KST 기준). ymd='YYYY-MM-DD', hhmm='HH:MM'
  function isPast(ymd, hhmm) {
    if (!ymd || !hhmm) return false;
    return new Date(`${ymd}T${hhmm}:00`).getTime() < Date.now();
  }
  // 고객 검색 조건 (순서는 localStorage에 개인별 저장)
  const SCH_CONDS = [
    { key: 'hpid',  label: '병원ID', placeholder: '병원 환자 ID (3자 이상)', param: 'hospital_patient_id' },
    { key: 'email', label: '이메일', placeholder: '이메일 (3자 이상)', param: 'email' },
    { key: 'name',  label: '이름',   placeholder: '고객 이름 (3자 이상)', param: 'name' },
  ];
  const COND_ORDER_KEY = 'sch_cust_cond_order';
  function condByKey(key) { return SCH_CONDS.find((c) => c.key === key); }
  function getCondOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(COND_ORDER_KEY) || 'null');
      if (Array.isArray(saved)) {
        const valid = saved.filter((k) => SCH_CONDS.some((c) => c.key === k));
        SCH_CONDS.forEach((c) => { if (!valid.includes(c.key)) valid.push(c.key); }); // 신규 조건은 끝에 보강
        if (valid.length) return valid;
      }
    } catch (e) {}
    return SCH_CONDS.map((c) => c.key);
  }
  function saveCondOrder(order) { try { localStorage.setItem(COND_ORDER_KEY, JSON.stringify(order)); } catch (e) {} }
  const STATUS_LABEL = { consulting: '진료', operating: '수술', absent: '부재' };
  const STATUS_ICON = { consulting: '🩺', operating: '🔪', absent: '🌙' };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  // 의사 구분 색 팔레트 (RED 계열·blue 계열 제외)
  const DOCTOR_PALETTE = ['#16a34a', '#d97706', '#7c3aed', '#0d9488', '#65a30d', '#b45309', '#9333ea', '#ca8a04', '#0f766e', '#c026d3', '#4d7c0f', '#a16207'];
  function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(f, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  // 일정이 지난 시간대인지 (시작 시각 기준)
  function isPastAppt(a) { return new Date(`${a.start_at.slice(0, 10)}T${a.start_at.slice(11, 16)}:00`).getTime() < Date.now(); }

  // ── API ────────────────────────────────────────────────────
  async function apiGet(url) {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.error || '조회 실패');
    return d;
  }
  async function apiSend(method, url, body) {
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { const e = new Error(d.error || '요청 실패'); e.payload = d; e.status = r.status; throw e; }
    return d;
  }

  // ── 스타일 1회 주입 ─────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('sch-styles')) return;
    const css = `
    .sch-wrap{font-size:13px;color:var(--gray-800)}
    .sch-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 4px;border-bottom:1px solid var(--gray-200);margin-bottom:10px}
    .sch-title{font-size:16px;font-weight:700;min-width:160px}
    .sch-views{display:flex;border:1px solid var(--gray-300);border-radius:6px;overflow:hidden}
    .sch-views button{border:none;background:#fff;padding:6px 12px;cursor:pointer;font-size:13px}
    .sch-views button.active{background:var(--primary);color:#fff}
    .sch-legend{display:flex;gap:10px;align-items:center;margin-left:auto;font-size:12px;color:var(--gray-600)}
    .sch-legend span{display:inline-flex;align-items:center;gap:4px}
    .sch-dot{width:11px;height:11px;border-radius:3px;display:inline-block}
    /* 월뷰 */
    .sch-month{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid var(--gray-200);border-radius:8px;overflow:hidden}
    .sch-mh{background:var(--gray-50);text-align:center;padding:6px 0;font-weight:600;font-size:12px;border-bottom:1px solid var(--gray-200)}
    .sch-mh.sun{color:#dc2626}.sch-mh.sat{color:#2563eb}
    .sch-cell{min-height:96px;border-right:1px solid var(--gray-100);border-bottom:1px solid var(--gray-100);padding:4px 5px;cursor:pointer;position:relative;background:#fff}
    .sch-cell.other{background:var(--gray-50);color:var(--gray-400)}
    .sch-cell.closed{background:repeating-linear-gradient(45deg,#fef2f2,#fef2f2 8px,#fee2e2 8px,#fee2e2 16px)}
    .sch-cell .d{font-size:12px;font-weight:600}
    .sch-cell .d.sun{color:#dc2626}.sch-cell .d.sat{color:#2563eb}
    .sch-badge{font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px;cursor:pointer;vertical-align:middle}
    .sch-badge.nat{background:#fee2e2;color:#b91c1c}
    .sch-badge.ovr-work{background:#dcfce7;color:#15803d}
    .sch-badge.ovr-closed{background:#e0e7ff;color:#4338ca}
    .sch-chip{font-size:11px;border-radius:4px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sch-chip.consulting{background:#dbeafe;color:#1e40af}
    .sch-chip.operating{background:#ede9fe;color:#5b21b6}
    .sch-chip.absent{background:#f1f5f9;color:#475569}
    /* 주/일뷰 */
    .sch-grid{display:flex;border:1px solid var(--gray-200);border-radius:8px;overflow:hidden;user-select:none}
    .sch-gutter{width:48px;flex:none;background:var(--gray-50);border-right:1px solid var(--gray-200)}
    .sch-gutter .h{height:48px;font-size:11px;color:var(--gray-500);text-align:right;padding:2px 5px 0 0;box-sizing:border-box}
    .sch-cols{display:flex;flex:1;overflow-x:auto}
    .sch-col{flex:1;min-width:120px;border-right:1px solid var(--gray-100);display:flex;flex-direction:column}
    .sch-colhd{text-align:center;padding:5px 0;font-size:12px;font-weight:600;border-bottom:1px solid var(--gray-200);background:var(--gray-50)}
    .sch-colhd.sun{color:#dc2626}.sch-colhd.sat{color:#2563eb}
    .sch-colhd.closed{background:#fef2f2}
    .sch-colbody{position:relative;flex:1}
    .sch-colbody.closed{background:repeating-linear-gradient(45deg,#fef2f2,#fef2f2 8px,#fee2e2 8px,#fee2e2 16px);cursor:not-allowed}
    .sch-hline{position:absolute;left:0;right:0;border-top:1px solid var(--gray-100)}
    .sch-block{position:absolute;left:2px;right:2px;border-radius:4px;padding:2px 4px;font-size:11px;overflow:hidden;box-sizing:border-box;cursor:pointer;z-index:2}
    .sch-block.consulting{background:#dbeafe;border-left:3px solid #2563eb;color:#1e3a8a}
    .sch-block.operating{background:#ede9fe;border-left:3px solid #7c3aed;color:#4c1d95}
    .sch-block.absent{background:repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 6px,#e2e8f0 6px,#e2e8f0 12px);border-left:3px solid #94a3b8;color:#475569}
    .sch-block .ln{line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sch-tag{font-size:10px;font-weight:700;color:#fff;padding:0 6px;border-radius:3px;line-height:16px;display:inline-block;flex:none}
    .sch-block.past{opacity:.6}
    .sch-doc-legend{display:flex;gap:10px;align-items:center;margin-left:auto;font-size:12px;color:var(--gray-600);flex-wrap:wrap;max-width:46%;justify-content:flex-end}
    .sch-doc-legend span{display:inline-flex;align-items:center;gap:4px}
    .sch-handle{position:absolute;left:0;right:0;height:6px;cursor:ns-resize;z-index:3}
    .sch-handle.t{top:0}.sch-handle.b{bottom:0}
    .sch-ghost{position:absolute;left:2px;right:2px;background:rgba(37,99,235,.18);border:1px dashed #2563eb;border-radius:4px;z-index:4;pointer-events:none}
    .sch-past-overlay{position:absolute;left:0;right:0;top:0;z-index:1;cursor:not-allowed;background:repeating-linear-gradient(45deg,rgba(148,163,184,.10),rgba(148,163,184,.10) 6px,rgba(148,163,184,.03) 6px,rgba(148,163,184,.03) 12px)}
    .sch-search-row{display:flex;gap:14px}
    .sch-search-left{flex:1;min-width:0}
    .sch-search-right{width:300px;flex:none;border-left:1px solid var(--gray-200);padding-left:14px;max-height:430px;overflow:auto}
    .sch-res{border:1px solid var(--gray-200);border-radius:6px;max-height:380px;overflow:auto}
    .sch-res-item{padding:8px 10px;border-bottom:1px solid var(--gray-100);cursor:pointer}
    .sch-res-item:hover{background:var(--gray-50)}
    .sch-res-item.sel{background:#eff6ff}
    .sch-kv{display:flex;font-size:12px;margin:3px 0}
    .sch-kv b{width:78px;flex:none;color:var(--gray-500);font-weight:500}
    .sch-survey{border:1px solid var(--gray-200);border-radius:6px;margin-top:8px}
    .sch-survey summary{padding:6px 8px;cursor:pointer;font-size:12px;font-weight:600}
    .sch-survey .qa{padding:4px 10px;font-size:12px;border-top:1px solid var(--gray-100)}
    .sch-pick-btn{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;font-size:15px;padding:2px;line-height:1}
    .sch-pick-btn:disabled{opacity:.4;cursor:not-allowed}
    .sch-pick-native{position:absolute;width:1px;height:1px;opacity:0;right:8px;bottom:0;pointer-events:none}
    .sch-invalid{border-color:#dc2626 !important;background:#fef2f2}
    .sch-suggest{position:absolute;left:0;right:0;top:100%;margin-top:2px;z-index:20;background:#fff;border:1px solid var(--gray-200);border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,.12);max-height:220px;overflow:auto}
    .sch-suggest-item{padding:7px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--gray-100)}
    .sch-suggest-item:last-child{border-bottom:none}
    .sch-suggest-item:hover{background:#eff6ff}
    .sch-cond-field{margin-bottom:8px}
    .sch-cond-field .form-label{font-size:12px;margin-bottom:2px}
    .sch-cond-list{list-style:none;margin:0;padding:0}
    .sch-cond-list li{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;background:#fff;cursor:grab;font-size:13px}
    .sch-cond-list li.dragging{opacity:.5;background:#eff6ff}
    .sch-cond-handle{color:var(--gray-400);font-size:14px}
    .sch-cond-num{width:20px;height:20px;border-radius:50%;background:var(--gray-100);color:var(--gray-600);font-size:11px;display:inline-flex;align-items:center;justify-content:center}
    `;
    const el = document.createElement('style');
    el.id = 'sch-styles'; el.textContent = css;
    document.head.appendChild(el);
  }

  // ── 모달 헬퍼 ───────────────────────────────────────────────
  function ensureModals() {
    if (document.getElementById('schApptOverlay')) return;
    const html = `
    <div class="overlay" id="schApptOverlay">
      <div class="overlay-dialog" style="max-width:480px;width:97%">
        <div class="overlay-header" style="background:var(--primary,#2563eb);border-radius:8px 8px 0 0;position:relative"><span class="overlay-title" id="schApptTitle" style="flex:1;text-align:center;color:#fff">일정 등록</span><button class="overlay-close" data-sch-close="schApptOverlay" style="color:#fff;position:absolute;right:14px;top:50%;transform:translateY(-50%)">✕</button></div>
        <div class="overlay-body" style="padding:20px 22px">
          <div class="form-group" style="display:flex;align-items:center;gap:10px">
            <label class="form-label" style="margin:0;width:54px;flex:none">의사</label>
            <select class="form-control" id="schApptDoctor" style="flex:1"></select></div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px">
            <label class="form-label" style="margin:0;width:54px;flex:none">상태</label>
            <div style="display:flex;gap:16px;flex:1;flex-wrap:wrap">
              <label style="display:flex;gap:5px;align-items:center"><input type="radio" name="schStatus" value="consulting" checked> 진료</label>
              <label style="display:flex;gap:5px;align-items:center"><input type="radio" name="schStatus" value="operating"> 수술</label>
              <label style="display:flex;gap:5px;align-items:center"><input type="radio" name="schStatus" value="absent"> 부재(휴가)</label>
            </div></div>
          <div style="display:flex;gap:10px">
            <div class="form-group" style="flex:1.5">
              <label class="form-label" id="schDateLabel">날짜</label>
              <div style="position:relative">
                <input type="text" class="form-control" id="schApptDate" placeholder="20260607" inputmode="numeric" maxlength="10" autocomplete="off" style="padding-right:30px">
                <button type="button" class="sch-pick-btn" data-pick="schApptDatePick" title="달력 선택">📅</button>
                <input type="date" id="schApptDatePick" class="sch-pick-native" tabindex="-1">
              </div>
            </div>
            <div class="form-group" style="flex:1.5;display:none" id="schDateToWrap">
              <label class="form-label">종료일</label>
              <div style="position:relative">
                <input type="text" class="form-control" id="schApptDateTo" placeholder="20260609" inputmode="numeric" maxlength="10" autocomplete="off" style="padding-right:30px">
                <button type="button" class="sch-pick-btn" data-pick="schApptDateToPick" title="달력 선택">📅</button>
                <input type="date" id="schApptDateToPick" class="sch-pick-native" tabindex="-1">
              </div>
            </div>
            <div class="form-group" style="flex:1" id="schStartWrap">
              <label class="form-label">시작</label>
              <div style="position:relative">
                <input type="text" class="form-control" id="schApptStart" placeholder="1335" inputmode="numeric" maxlength="5" autocomplete="off" style="padding-right:30px">
                <button type="button" class="sch-pick-btn" data-pick="schApptStartPick" title="시간 선택">🕐</button>
                <input type="time" id="schApptStartPick" class="sch-pick-native" tabindex="-1">
              </div>
            </div>
            <div class="form-group" style="flex:1" id="schEndWrap">
              <label class="form-label">종료</label>
              <div style="position:relative">
                <input type="text" class="form-control" id="schApptEnd" placeholder="1420" inputmode="numeric" maxlength="5" autocomplete="off" style="padding-right:30px">
                <button type="button" class="sch-pick-btn" data-pick="schApptEndPick" title="시간 선택">🕐</button>
                <input type="time" id="schApptEndPick" class="sch-pick-native" tabindex="-1">
              </div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--gray-400);margin-top:-6px;margin-bottom:8px;display:none" id="schAbsentHint">※ 부재(휴가)는 시작일~종료일의 각 날짜에 지정한 시간대로 일정이 생성됩니다.</div>
          <div class="form-group" id="schApptCustWrap"><label class="form-label">고객(환자)</label>
            <div style="display:flex;gap:8px;align-items:center">
              <div id="schApptCustLabel" style="flex:1;padding:8px 10px;border:1px solid var(--gray-200);border-radius:6px;color:var(--gray-500)">선택 안 됨</div>
              <button class="btn btn-ghost btn-sm" id="schApptCustBtn">🔍 고객 검색</button>
            </div></div>
          <div class="form-group"><label class="form-label">메모</label><textarea class="form-control" id="schApptNote" rows="2"></textarea></div>
          <div id="schApptError" style="display:none;color:#dc2626;font-size:12px;font-weight:600;margin-top:-4px"></div>
        </div>
        <div class="overlay-footer" style="justify-content:center">
          <button class="btn btn-danger" id="schApptDelete" style="display:none">삭제</button>
          <button class="btn btn-ghost" data-sch-close="schApptOverlay">취소</button>
          <button class="btn btn-primary" id="schApptSave">저장</button>
        </div>
      </div>
    </div>
    <div class="overlay" id="schCustOverlay">
      <div class="overlay-dialog" style="max-width:720px;width:97%">
        <div class="overlay-header" style="background:var(--primary,#2563eb);border-radius:8px 8px 0 0;position:relative"><span class="overlay-title" style="flex:1;text-align:center;color:#fff">고객 검색</span><button class="overlay-close" data-sch-close="schCustOverlay" style="color:#fff;position:absolute;right:14px;top:50%;transform:translateY(-50%)">✕</button></div>
        <div class="overlay-body" style="padding:18px 22px">
          <div class="sch-search-row">
            <div class="sch-search-left">
              <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
                <button class="btn btn-ghost btn-sm" id="schCustCondBtn" title="검색조건 순서 조정">⚙ 검색조건조정</button>
              </div>
              <div id="schCustFields" style="margin-bottom:8px"></div>
              <div style="display:flex;gap:8px;margin-bottom:10px">
                <button class="btn btn-primary btn-sm" id="schCustSearchBtn" style="flex:1">🔍 조회</button>
                <button class="btn btn-ghost btn-sm" id="schCustResetBtn">초기화</button>
              </div>
              <div class="sch-res" id="schCustResults"><div style="padding:14px;color:var(--gray-400);font-size:12px">검색 결과가 여기에 표시됩니다.</div></div>
            </div>
            <div class="sch-search-right" id="schCustInfo"><div style="color:var(--gray-400);font-size:12px">고객을 선택하면 기본정보·문진이 표시됩니다.</div></div>
          </div>
        </div>
        <div class="overlay-footer" style="justify-content:center">
          <button class="btn btn-ghost" data-sch-close="schCustOverlay">닫기</button>
          <button class="btn btn-primary" id="schCustPick" disabled>이 고객 선택</button>
        </div>
      </div>
    </div>
    <div class="overlay" id="schCondOverlay">
      <div class="overlay-dialog" style="max-width:340px;width:97%">
        <div class="overlay-header" style="background:var(--primary,#2563eb);border-radius:8px 8px 0 0;position:relative"><span class="overlay-title" style="flex:1;text-align:center;color:#fff">검색조건 순서 조정</span><button class="overlay-close" data-sch-close="schCondOverlay" style="color:#fff;position:absolute;right:14px;top:50%;transform:translateY(-50%)">✕</button></div>
        <div class="overlay-body" style="padding:18px 22px">
          <div style="font-size:12px;color:var(--gray-500);margin-bottom:12px">항목을 끌어서 순서를 바꿀 수 있습니다. 변경은 본인에게만 적용됩니다.</div>
          <ul id="schCondList" class="sch-cond-list"></ul>
        </div>
        <div class="overlay-footer" style="justify-content:center">
          <button class="btn btn-ghost" id="schCondResetBtn">기본 순서</button>
          <button class="btn btn-ghost" data-sch-close="schCondOverlay">취소</button>
          <button class="btn btn-primary" id="schCondSaveBtn">저장</button>
        </div>
      </div>
    </div>
    <div class="overlay" id="schHolidayOverlay">
      <div class="overlay-dialog" style="max-width:400px;width:97%">
        <div class="overlay-header"><span class="overlay-title" id="schHolTitle">휴일 관리</span><button class="overlay-close" data-sch-close="schHolidayOverlay">✕</button></div>
        <div class="overlay-body" style="padding:20px 22px"><div id="schHolBody"></div></div>
      </div>
    </div>`;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-sch-close]').forEach((b) =>
      b.addEventListener('click', () => closeOv(b.getAttribute('data-sch-close'))));
  }
  function openOv(id) { const el = document.getElementById(id); el.style.display = 'flex'; setTimeout(() => el.classList.add('visible'), 10); }
  function closeOv(id) { const el = document.getElementById(id); el.classList.remove('visible'); setTimeout(() => { el.style.display = 'none'; }, 200); }

  // 일정 저장 전용 토스트 — 파란색, 화면 상단 가운데
  function schToast(message) {
    let c = document.getElementById('sch-toast-wrap');
    if (!c) {
      c = document.createElement('div');
      c.id = 'sch-toast-wrap';
      c.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none';
      document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.textContent = message;
    t.style.cssText = 'background:#2563eb;color:#fff;font-weight:700;font-size:14px;text-align:center;padding:12px 28px;border-radius:8px;box-shadow:0 8px 24px rgba(37,99,235,.35);opacity:0;transform:translateY(-8px);transition:opacity .18s ease,transform .18s ease';
    c.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-8px)'; setTimeout(() => t.remove(), 200); }, 2200);
  }

  // ── 달력 클래스 ─────────────────────────────────────────────
  class ScheduleCalendar {
    constructor(root, opts) {
      this.root = root;
      this.role = opts.role || 'advertiser';
      this.readOnly = this.role === 'doctor';
      this.canHoliday = this.role === 'advertiser';
      this.view = 'week';
      this.anchor = todayYMD();
      this.doctorId = '';
      this.doctors = [];
      this.appts = [];
      this.holidays = {};
      this.dayStart = 8 * 60;
      this.dayEnd = 21 * 60;
      this.pxPerMin = 0.8;
      this.snap = 15;
      this.pending = null;       // 편집 중 고객 {visit_id,name,email,hospital_patient_id}
      this.editingId = null;
    }
    gh() { return (this.dayEnd - this.dayStart) * this.pxPerMin; }

    async init() {
      injectStyles(); ensureModals();
      try { const d = await apiGet('/api/schedule/doctors'); this.doctors = d.data; }
      catch (e) { this.doctors = []; }
      this.doctorColors = {};
      this.doctors.forEach((d, i) => { this.doctorColors[d.id] = DOCTOR_PALETTE[i % DOCTOR_PALETTE.length]; });
      if (this.role === 'doctor' && this.doctors.length) this.doctorId = String(this.doctors[0].id);
      this.renderShell();
      this.wireModals();
      await this.load();
    }
    docColor(id) { return (this.doctorColors && this.doctorColors[id]) || '#64748b'; }
    styleDoctorSelect(sel) {
      [...sel.options].forEach((o) => {
        if (!o.value) { o.style.color = ''; o.style.background = ''; o.style.fontWeight = ''; return; }
        const col = this.docColor(o.value);
        o.style.color = col; o.style.background = hexToRgba(col, 0.12); o.style.fontWeight = '600';
      });
      sel.style.color = sel.value ? this.docColor(sel.value) : '';
      sel.style.fontWeight = sel.value ? '600' : '';
    }

    // 조회 범위
    range() {
      const a = parseYMD(this.anchor);
      if (this.view === 'day') return [this.anchor, this.anchor];
      if (this.view === 'week') { const s = startOfWeekSun(a); return [fmtDate(s), fmtDate(addDays(s, 6))]; }
      // month: 6주 그리드
      const first = new Date(a.getFullYear(), a.getMonth(), 1);
      const gridStart = startOfWeekSun(first);
      return [fmtDate(gridStart), fmtDate(addDays(gridStart, 41))];
    }

    async load() {
      const [from, to] = this.range();
      let url = `/api/schedule/appointments?from=${from}&to=${to}`;
      if (this.doctorId) url += `&doctor_id=${this.doctorId}`;
      try {
        const [ap, hol] = await Promise.all([apiGet(url), apiGet(`/api/holidays?from=${from}&to=${to}`)]);
        this.appts = ap.data; this.holidays = hol.holidays || {};
      } catch (e) { MxAlert.error(e.message); return; }
      this.renderBody();
    }

    // 셸(툴바) 렌더
    renderShell() {
      const docOpts = ['<option value="">전체 의사</option>']
        .concat(this.doctors.map((d) => `<option value="${d.id}">${esc(d.name)}${d.specialty ? ' · ' + esc(d.specialty) : ''}</option>`)).join('');
      this.root.innerHTML = `
      <div class="sch-wrap">
        <div class="sch-toolbar">
          <button class="btn btn-ghost btn-sm" id="schPrev">◀</button>
          <button class="btn btn-ghost btn-sm" id="schToday">오늘</button>
          <button class="btn btn-ghost btn-sm" id="schNext">▶</button>
          <div class="sch-title" id="schTitle"></div>
          <div class="sch-views">
            <button data-v="month">월</button><button data-v="week">주</button><button data-v="day">일</button>
          </div>
          <select class="form-control" id="schDoctor" style="width:200px;height:32px;padding:2px 8px"${this.role === 'doctor' ? ' disabled' : ''}>${docOpts}</select>
          <div class="sch-doc-legend">
            ${this.doctors.map((d) => `<span><i class="sch-dot" style="background:${this.docColor(d.id)}"></i>${esc(d.name)}</span>`).join('')}
          </div>
        </div>
        <div id="schBody"></div>
      </div>`;
      const $ = (id) => this.root.querySelector(id);
      $('#schPrev').onclick = () => this.nav(-1);
      $('#schNext').onclick = () => this.nav(1);
      $('#schToday').onclick = () => { this.anchor = todayYMD(); this.load(); };
      this.root.querySelectorAll('.sch-views button').forEach((b) => {
        b.onclick = () => { this.view = b.dataset.v; this.syncViewBtns(); this.load(); };
      });
      const ds = $('#schDoctor');
      ds.value = this.doctorId;
      this.styleDoctorSelect(ds);
      ds.onchange = () => { this.doctorId = ds.value; this.styleDoctorSelect(ds); this.load(); };
      this.syncViewBtns();
    }
    syncViewBtns() {
      this.root.querySelectorAll('.sch-views button').forEach((b) => b.classList.toggle('active', b.dataset.v === this.view));
    }
    nav(dir) {
      const a = parseYMD(this.anchor);
      if (this.view === 'day') this.anchor = fmtDate(addDays(a, dir));
      else if (this.view === 'week') this.anchor = fmtDate(addDays(a, dir * 7));
      else this.anchor = fmtDate(new Date(a.getFullYear(), a.getMonth() + dir, 1));
      this.load();
    }
    setTitle() {
      const a = parseYMD(this.anchor);
      let t;
      if (this.view === 'day') t = `${this.anchor} (${WD[a.getDay()]})`;
      else if (this.view === 'week') { const [f, to] = this.range(); t = `${f} ~ ${to}`; }
      else t = `${a.getFullYear()}년 ${a.getMonth() + 1}월`;
      this.root.querySelector('#schTitle').textContent = t;
    }

    renderBody() {
      this.setTitle();
      if (this.view === 'month') this.renderMonth();
      else this.renderTime();
    }

    // ── 월뷰 ─────────────────────────────────────────────────
    renderMonth() {
      const body = this.root.querySelector('#schBody');
      const [gridStart] = this.range();
      const start = parseYMD(gridStart);
      const curMonth = parseYMD(this.anchor).getMonth();
      const byDay = {};
      this.appts.forEach((ap) => { const k = ap.start_at.slice(0, 10); (byDay[k] = byDay[k] || []).push(ap); });

      let html = '<div class="sch-month">';
      WD.forEach((w, i) => html += `<div class="sch-mh ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`);
      for (let i = 0; i < 42; i++) {
        const d = addDays(start, i); const ymd = fmtDate(d);
        const dow = d.getDay();
        const other = d.getMonth() !== curMonth;
        const eff = this.holidays[ymd];
        const closed = eff && eff.effective_type === 'closed';
        const list = (byDay[ymd] || []).slice(0, 3);
        const more = (byDay[ymd] || []).length - list.length;
        html += `<div class="sch-cell ${other ? 'other' : ''} ${closed ? 'closed' : ''}" data-day="${ymd}">
          <div><span class="d ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}">${d.getDate()}</span>${this.badgeHtml(ymd, eff)}</div>
          ${list.map((ap) => { const col = this.docColor(ap.doctor_id); return `<div class="sch-chip" style="background:${hexToRgba(col, 0.16)};color:${col}" title="${esc(this.chipTitle(ap))}"><span class="sch-tag" style="background:${col};font-size:9px;line-height:14px;padding:0 4px">${STATUS_LABEL[ap.status]}</span> ${minToTime(splitDt(ap.start_at).min)} ${esc(ap.doctor_name || '')}</div>`; }).join('')}
          ${more > 0 ? `<div class="sch-chip" style="background:none;color:var(--gray-500)">+${more}건</div>` : ''}
        </div>`;
      }
      html += '</div>';
      body.innerHTML = html;
      body.querySelectorAll('.sch-cell').forEach((c) => {
        c.addEventListener('click', (e) => {
          if (e.target.classList.contains('sch-badge')) return;
          this.anchor = c.dataset.day; this.view = 'day'; this.syncViewBtns(); this.load();
        });
      });
      if (this.canHoliday) body.querySelectorAll('.sch-badge').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); this.openHoliday(b.dataset.day); });
      });
    }
    badgeHtml(ymd, eff) {
      if (!eff) return this.canHoliday ? `<span class="sch-badge" data-day="${ymd}" style="background:var(--gray-100);color:var(--gray-400)">+</span>` : '';
      if (eff.effective_type === 'working') return `<span class="sch-badge ovr-work" data-day="${ymd}" title="${esc(eff.name || '')}">근무</span>`;
      const cls = eff.is_override ? 'ovr-closed' : 'nat';
      return `<span class="sch-badge ${cls}" data-day="${ymd}" title="${esc(eff.name || '')}">휴무</span>`;
    }
    chipTitle(ap) {
      return `${STATUS_LABEL[ap.status]} · ${ap.doctor_name || ''}${ap.customer_name ? ' · ' + ap.customer_name : ''} (${minToTime(splitDt(ap.start_at).min)}~${minToTime(splitDt(ap.end_at).min)})`;
    }

    // ── 주/일뷰 ──────────────────────────────────────────────
    renderTime() {
      const body = this.root.querySelector('#schBody');
      const [from] = this.range();
      const days = this.view === 'day' ? [this.anchor] : Array.from({ length: 7 }, (_, i) => fmtDate(addDays(parseYMD(from), i)));
      const hourCount = (this.dayEnd - this.dayStart) / 60;
      let gutter = '<div class="sch-gutter"><div style="height:27px"></div>';
      for (let h = 0; h < hourCount; h++) gutter += `<div class="h">${pad(this.dayStart / 60 + h)}:00</div>`;
      gutter += '</div>';

      let cols = '<div class="sch-cols">';
      days.forEach((ymd) => {
        const d = parseYMD(ymd); const dow = d.getDay();
        const eff = this.holidays[ymd];
        const closed = eff && eff.effective_type === 'closed';
        cols += `<div class="sch-col" data-day="${ymd}">
          <div class="sch-colhd ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${closed ? 'closed' : ''}">${this.view === 'week' ? `${d.getMonth() + 1}/${d.getDate()} (${WD[dow]})` : `${ymd} (${WD[dow]})`}${closed ? ' · 휴무' : ''}</div>
          <div class="sch-colbody ${closed ? 'closed' : ''}" data-day="${ymd}" style="height:${this.gh()}px"></div>
        </div>`;
      });
      cols += '</div>';
      body.innerHTML = `<div class="sch-grid">${gutter}${cols}</div>`;

      // 지난 시간대 표시용
      const today = todayYMD();
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      // 시간선 + 블록
      body.querySelectorAll('.sch-colbody').forEach((cb) => {
        for (let h = 0; h <= hourCount; h++) {
          const ln = document.createElement('div'); ln.className = 'sch-hline'; ln.style.top = (h * 60 * this.pxPerMin) + 'px';
          cb.appendChild(ln);
        }
        const ymd = cb.dataset.day;
        // 지난 시간대 오버레이 (입력 불가 표시 — not-allowed 커서)
        let pastEnd = null;
        if (ymd < today) pastEnd = this.dayEnd;
        else if (ymd === today) pastEnd = Math.min(Math.max(nowMin, this.dayStart), this.dayEnd);
        if (pastEnd && pastEnd > this.dayStart) {
          const ov = document.createElement('div');
          ov.className = 'sch-past-overlay';
          ov.style.height = ((pastEnd - this.dayStart) * this.pxPerMin) + 'px';
          cb.appendChild(ov);
        }
        const dayAppts = this.appts.filter((a) => a.start_at.slice(0, 10) === ymd)
          .map((a) => ({ ...a, s: splitDt(a.start_at).min, e: splitDt(a.end_at).min }));
        layoutDay(dayAppts);
        dayAppts.forEach((a) => cb.appendChild(this.blockEl(a)));
        if (!this.readOnly && !(this.holidays[ymd] && this.holidays[ymd].effective_type === 'closed')) {
          this.wireDragCreate(cb, ymd);
        }
      });
    }

    blockEl(a) {
      const top = Math.max(0, (a.s - this.dayStart) * this.pxPerMin);
      const bottom = Math.min(this.gh(), (a.e - this.dayStart) * this.pxPerMin);
      const past = isPastAppt(a);
      const locked = this.readOnly || past; // 읽기전용(의사) 또는 지난 일정 → 수정/삭제 불가
      const col = this.docColor(a.doctor_id);
      const el = document.createElement('div');
      el.className = `sch-block ${a.status}${past ? ' past' : ''}`;
      el.style.top = top + 'px'; el.style.height = Math.max(16, bottom - top) + 'px';
      // 배경 = 의사 색(연한 톤), 좌측 = 의사 색 (어느 의사인지 식별)
      el.style.borderLeft = `3px solid ${col}`;
      el.style.background = a.status === 'absent'
        ? `repeating-linear-gradient(45deg, ${hexToRgba(col, 0.16)}, ${hexToRgba(col, 0.16)} 6px, ${hexToRgba(col, 0.04)} 6px, ${hexToRgba(col, 0.04)} 12px)`
        : hexToRgba(col, 0.16);
      const cols = a.cols || 1, lane = a.lane || 0;
      const w = 100 / cols;
      el.style.left = `calc(${lane * w}% + 2px)`; el.style.width = `calc(${w}% - 4px)`;
      // 의사: 이름(진료과목), 환자: 이름(국적), 담당자: 이름
      const spec = a.doctor_specialty ? `(${esc(a.doctor_specialty)})` : '';
      const nat = a.customer_nationality ? `(${esc(a.customer_nationality)})` : '';
      const patientLine = a.status === 'absent'
        ? `<div class="ln">${esc(a.title || '부재(휴가)')}</div>`
        : `<div class="ln">환자: ${esc(a.customer_name || '미지정')}${nat}</div>`;
      el.innerHTML = `<div class="ln" style="display:flex;align-items:center;gap:4px">
          <span class="sch-tag" style="background:${col}">${STATUS_LABEL[a.status]}</span>
          <span style="font-weight:600">${minToTime(a.s)}~${minToTime(a.e)}</span>
        </div>
        <div class="ln" style="font-weight:600;color:${col}">의사: ${esc(a.doctor_name || '')}${spec}</div>
        ${patientLine}
        ${a.manager_name ? `<div class="ln">담당자: ${esc(a.manager_name)}</div>` : ''}`;
      el.onclick = (e) => { e.stopPropagation(); if (el._suppressClick) { el._suppressClick = false; return; } this.openEdit(a, past); };
      if (!locked) {
        ['t', 'b'].forEach((pos) => {
          const h = document.createElement('div'); h.className = `sch-handle ${pos}`;
          h.addEventListener('mousedown', (ev) => { ev.stopPropagation(); this.startResize(ev, a, pos, el); });
          el.appendChild(h);
        });
        el.addEventListener('mousedown', (ev) => {
          if (ev.target.classList.contains('sch-handle')) return;
          this.startMove(ev, a, el);
        });
      }
      return el;
    }

    // 드래그 생성
    wireDragCreate(cb, ymd) {
      cb.addEventListener('mousedown', (ev) => {
        if (ev.target.closest('.sch-block')) return;
        const rect = cb.getBoundingClientRect();
        const y0 = ev.clientY - rect.top;
        const startMin = this.snapMin(this.dayStart + y0 / this.pxPerMin);
        if (isPast(ymd, minToTime(startMin))) return; // 지난 시간대: 드래그 생성 불가
        const ghost = document.createElement('div'); ghost.className = 'sch-ghost'; cb.appendChild(ghost);
        let curEnd = startMin + this.snap;
        const onMove = (e) => {
          const y = e.clientY - rect.top;
          curEnd = this.snapMin(this.dayStart + y / this.pxPerMin);
          const a = Math.min(startMin, curEnd), b = Math.max(startMin, curEnd);
          ghost.style.top = (a - this.dayStart) * this.pxPerMin + 'px';
          ghost.style.height = Math.max(this.snap * this.pxPerMin, (b - a) * this.pxPerMin) + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
          ghost.remove();
          let a = Math.min(startMin, curEnd), b = Math.max(startMin, curEnd);
          if (b - a < this.snap) b = a + 30; // 최소 30분
          if (isPast(ymd, minToTime(a))) return; // 지난 시간대로 끌어올린 경우 무시
          this.openCreate(ymd, a, b);
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
      });
    }
    snapMin(min) { return Math.max(this.dayStart, Math.min(this.dayEnd, Math.round(min / this.snap) * this.snap)); }

    // 커서 위치의 날짜 컬럼(.sch-colbody)
    _colbodyAt(x, y) {
      const list = this.root.querySelectorAll('.sch-colbody');
      for (const cb of list) {
        const r = cb.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return cb;
      }
      return null;
    }
    // 리사이즈: drop 시 등록 popup (저장해야 확정)
    startResize(ev, a, pos, el) {
      ev.preventDefault();
      const cb = el.parentElement; const rect = cb.getBoundingClientRect();
      const onMove = (e) => {
        const y = e.clientY - rect.top; const m = this.snapMin(this.dayStart + y / this.pxPerMin);
        if (pos === 't') { const ns = Math.min(m, a.e - this.snap); el.style.top = (ns - this.dayStart) * this.pxPerMin + 'px'; el.style.height = (a.e - ns) * this.pxPerMin + 'px'; el._ns = ns; el._ne = a.e; }
        else { const ne = Math.max(m, a.s + this.snap); el.style.height = (ne - a.s) * this.pxPerMin + 'px'; el._ns = a.s; el._ne = ne; }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        if (el._ns == null) return;
        el._suppressClick = true;
        const date = a.start_at.slice(0, 10);
        if (isPast(date, minToTime(el._ns))) { MxAlert.error('지난 시간대로는 설정할 수 없습니다.'); this.renderBody(); return; }
        const ns = el._ns, ne = el._ne;
        this.renderBody(); // 저장 전 복원
        this.openEdit(a, false, { date, startMin: ns, endMin: ne });
      };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    }
    // 이동(다른 날짜 포함): drop 시 등록 popup (저장해야 확정)
    startMove(ev, a, el) {
      ev.preventDefault();
      const origDate = a.start_at.slice(0, 10);
      const dur = a.e - a.s;
      const grabOffsetY = ev.clientY - el.getBoundingClientRect().top;
      let moved = false;
      let targetCb = el.parentElement, targetStart = a.s;
      const onMove = (e) => {
        moved = true;
        const cb = this._colbodyAt(e.clientX, e.clientY) || targetCb;
        const rect = cb.getBoundingClientRect();
        let ns = this.snapMin(this.dayStart + (e.clientY - rect.top - grabOffsetY) / this.pxPerMin);
        if (ns + dur > this.dayEnd) ns = this.dayEnd - dur;
        if (ns < this.dayStart) ns = this.dayStart;
        if (cb !== el.parentElement) cb.appendChild(el); // 다른 날짜 컬럼으로 이동
        el.style.left = '2px'; el.style.right = '2px'; el.style.width = 'auto'; el.style.zIndex = '10';
        el.style.top = (ns - this.dayStart) * this.pxPerMin + 'px';
        targetCb = cb; targetStart = ns;
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        if (!moved) return;
        el._suppressClick = true;
        const newDate = targetCb.dataset.day;
        if (newDate === origDate && targetStart === a.s) { this.renderBody(); return; } // 변화 없음
        if (isPast(newDate, minToTime(targetStart))) { MxAlert.error('지난 시간대로는 이동할 수 없습니다.'); this.renderBody(); return; }
        this.renderBody(); // 저장 전까지 미확정 → 원위치 복원
        this.openEdit(a, false, { date: newDate, startMin: targetStart, endMin: targetStart + dur });
      };
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
    }

    // ── 생성/수정 모달 ───────────────────────────────────────
    fillDoctorSelect() {
      const sel = document.getElementById('schApptDoctor');
      sel.innerHTML = this.doctors.map((d) => `<option value="${d.id}">${esc(d.name)}${d.specialty ? ' · ' + esc(d.specialty) : ''}</option>`).join('');
      if (this.doctorId) sel.value = this.doctorId;
      sel.disabled = this.role === 'doctor';
      this.styleDoctorSelect(sel);
      sel.onchange = () => this.styleDoctorSelect(sel);
    }
    clearFieldErrors() {
      ['schApptDate', 'schApptDateTo', 'schApptStart', 'schApptEnd'].forEach((id) => document.getElementById(id).classList.remove('sch-invalid'));
      const box = document.getElementById('schApptError');
      if (box) { box.textContent = ''; box.style.display = 'none'; }
    }
    // 시간/날짜 검증 (오류 {f,m} 또는 null)
    modalError() {
      const dV = document.getElementById('schApptDate').value.trim();
      const sV = document.getElementById('schApptStart').value.trim();
      const eV = document.getElementById('schApptEnd').value.trim();
      const date = dV ? parseDateInput(dV) : null;
      const start = sV ? parseTimeInput(sV) : null;
      const end = eV ? parseTimeInput(eV) : null;
      if (dV && !date) return { f: 'schApptDate', m: '날짜 형식이 올바르지 않습니다. (예: 20260607)' };
      if (sV && !start) return { f: 'schApptStart', m: '시작 시간 형식이 올바르지 않습니다. (예: 1335)' };
      if (eV && !end) return { f: 'schApptEnd', m: '종료 시간 형식이 올바르지 않습니다. (예: 1420)' };
      if (start && end && timeToMin(end) <= timeToMin(start)) return { f: 'schApptEnd', m: '종료 시간은 시작 시간보다 뒤여야 합니다.' };
      if (date && start && isPast(date, start)) return { f: 'schApptStart', m: '지난 시간대로는 설정할 수 없습니다.' };
      return null;
    }
    // 검증 결과를 화면에 반영. showMsg=true면 인라인 오류 메시지 표시. 유효하면 true
    revalidate(showMsg) {
      const err = this.modalError();
      ['schApptDate', 'schApptStart', 'schApptEnd'].forEach((id) => document.getElementById(id).classList.remove('sch-invalid'));
      const box = document.getElementById('schApptError');
      if (err) {
        document.getElementById(err.f).classList.add('sch-invalid');
        if (showMsg && box) { box.textContent = '⚠ ' + err.m; box.style.display = 'block'; }
      } else if (box) { box.textContent = ''; box.style.display = 'none'; }
      this.updateSaveBtn();
      return !err;
    }
    openCreate(ymd, sMin, eMin) {
      this.editingId = null; this.pending = null; this.clearFieldErrors();
      document.getElementById('schApptTitle').textContent = '일정 등록';
      this.fillDoctorSelect();
      document.querySelector('input[name="schStatus"][value="consulting"]').checked = true;
      document.getElementById('schApptDate').value = ymd;
      document.getElementById('schApptDateTo').value = '';
      document.getElementById('schApptStart').value = minToTime(sMin);
      document.getElementById('schApptEnd').value = minToTime(eMin);
      document.getElementById('schApptNote').value = '';
      document.getElementById('schApptDelete').style.display = 'none';
      this.updateCustLabel(); this.applyStatusUI();
      this.setFormDisabled(false);
      this._formSnapshot = this.snapshotForm(); this.updateSaveBtn();
      openOv('schApptOverlay');
    }
    openEdit(a, forceReadOnly, override) {
      const ro = this.readOnly || !!forceReadOnly; // 지난 일정 등은 읽기전용
      this.editingId = a.id; this.clearFieldErrors();
      this.pending = a.visit_id ? { visit_id: a.visit_id, name: a.customer_name, email: a.customer_email, hospital_patient_id: a.hospital_patient_id } : null;
      document.getElementById('schApptTitle').textContent = ro ? (forceReadOnly ? '일정 상세 (지난 일정)' : '일정 상세') : (override ? '일정 이동 — 저장 시 확정' : '일정 수정');
      this.fillDoctorSelect();
      document.getElementById('schApptDoctor').value = a.doctor_id;
      document.querySelector(`input[name="schStatus"][value="${a.status}"]`).checked = true;
      const sp = splitDt(a.start_at), ep = splitDt(a.end_at);
      // 1) 원본 값으로 먼저 세팅 → 스냅샷 (이동/리사이즈가 '변경'으로 인식되도록)
      document.getElementById('schApptDate').value = sp.ymd;
      document.getElementById('schApptDateTo').value = sp.ymd;
      document.getElementById('schApptStart').value = minToTime(sp.min);
      document.getElementById('schApptEnd').value = minToTime(ep.min);
      document.getElementById('schApptNote').value = a.note || '';
      document.getElementById('schApptDelete').style.display = ro ? 'none' : 'inline-flex';
      this.updateCustLabel(); this.applyStatusUI();
      this.setFormDisabled(ro);
      this._formSnapshot = this.snapshotForm();
      // 2) 이동/리사이즈 결과(override) 적용 → 원본과 달라 저장 버튼 활성화됨
      if (override) {
        document.getElementById('schApptDate').value = override.date;
        document.getElementById('schApptDateTo').value = override.date;
        document.getElementById('schApptStart').value = minToTime(override.startMin);
        document.getElementById('schApptEnd').value = minToTime(override.endMin);
      }
      this.updateSaveBtn();
      openOv('schApptOverlay');
    }
    setFormDisabled(dis) {
      ['schApptDoctor', 'schApptDate', 'schApptDateTo', 'schApptStart', 'schApptEnd', 'schApptNote', 'schApptCustBtn'].forEach((id) => { document.getElementById(id).disabled = dis; });
      document.querySelectorAll('input[name="schStatus"]').forEach((r) => r.disabled = dis);
      document.querySelectorAll('#schApptOverlay .sch-pick-btn').forEach((b) => b.disabled = dis);
      document.getElementById('schApptSave').style.display = dis ? 'none' : 'inline-flex';
    }
    // 현재 폼 상태 스냅샷 (변경 감지용)
    snapshotForm() {
      return JSON.stringify({
        doctor: document.getElementById('schApptDoctor').value,
        status: this.curStatus(),
        date: document.getElementById('schApptDate').value,
        dateTo: document.getElementById('schApptDateTo').value,
        start: document.getElementById('schApptStart').value,
        end: document.getElementById('schApptEnd').value,
        note: document.getElementById('schApptNote').value,
        visit: this.pending ? this.pending.visit_id : null,
      });
    }
    // 변경 내역이 없으면 저장 버튼 비활성화
    updateSaveBtn() {
      const btn = document.getElementById('schApptSave');
      if (!btn) return;
      const unchanged = (this.snapshotForm() === this._formSnapshot);
      btn.disabled = unchanged || !!this.modalError(); // 변경 없음 또는 검증 오류 시 비활성
    }
    curStatus() { return document.querySelector('input[name="schStatus"]:checked').value; }
    applyStatusUI() {
      const absent = this.curStatus() === 'absent';
      document.getElementById('schApptCustWrap').style.display = absent ? 'none' : 'block';
      document.getElementById('schDateToWrap').style.display = absent ? 'block' : 'none';
      document.getElementById('schAbsentHint').style.display = absent ? 'block' : 'none';
      document.getElementById('schDateLabel').textContent = absent ? '시작일' : '날짜';
      // 부재중 전환 시 기본값 채움(시간=업무시간, 종료일=시작일)
      if (absent) {
        const st = document.getElementById('schApptStart'), et = document.getElementById('schApptEnd');
        if (!st.value.trim()) st.value = minToTime(this.dayStart);
        if (!et.value.trim()) et.value = minToTime(this.dayEnd);
        const dTo = document.getElementById('schApptDateTo'), dFrom = document.getElementById('schApptDate');
        if (!dTo.value.trim()) dTo.value = dFrom.value;
      }
    }
    updateCustLabel() {
      const el = document.getElementById('schApptCustLabel');
      if (this.pending) { el.textContent = `${this.pending.name || ''}${this.pending.hospital_patient_id ? ' · ' + this.pending.hospital_patient_id : ''}${this.pending.email ? ' · ' + this.pending.email : ''}`; el.style.color = 'var(--gray-800)'; }
      else { el.textContent = '선택 안 됨'; el.style.color = 'var(--gray-500)'; }
    }

    wireModals() {
      document.querySelectorAll('input[name="schStatus"]').forEach((r) => r.addEventListener('change', () => this.applyStatusUI()));
      // 날짜/시간 텍스트 입력: blur 시 정규화/검증 + 네이티브 피커 동기화
      const fields = [
        { txt: 'schApptDate', pick: 'schApptDatePick', parse: parseDateInput },
        { txt: 'schApptDateTo', pick: 'schApptDateToPick', parse: parseDateInput },
        { txt: 'schApptStart', pick: 'schApptStartPick', parse: parseTimeInput },
        { txt: 'schApptEnd', pick: 'schApptEndPick', parse: parseTimeInput },
      ];
      fields.forEach((f) => {
        const txt = document.getElementById(f.txt);
        const pick = document.getElementById(f.pick);
        txt.addEventListener('blur', () => {
          const v = txt.value.trim();
          if (v) { const norm = f.parse(v); if (norm) { txt.value = norm; pick.value = norm; } }
          this.revalidate(true); // focus out 즉시 검증/메시지
        });
        txt.addEventListener('input', () => txt.classList.remove('sch-invalid'));
        pick.addEventListener('change', () => { if (pick.value) { txt.value = pick.value; } this.revalidate(true); });
      });
      document.querySelectorAll('#schApptOverlay .sch-pick-btn').forEach((b) => {
        b.addEventListener('click', () => {
          const pick = document.getElementById(b.dataset.pick);
          const txtId = b.dataset.pick.replace('Pick', '');
          const t = document.getElementById(txtId);
          const norm = txtId.indexOf('Date') >= 0 ? parseDateInput(t.value) : parseTimeInput(t.value);
          if (norm) pick.value = norm;
          if (pick.showPicker) { try { pick.showPicker(); } catch (e) { pick.focus(); } }
          else { pick.focus(); pick.click(); }
        });
      });
      document.getElementById('schApptCustBtn').onclick = () => this.openCustomerSearch();
      document.getElementById('schApptSave').onclick = () => this.saveAppt();
      document.getElementById('schApptDelete').onclick = () => this.deleteAppt();
      // 변경 감지 → 저장 버튼 활성/비활성
      const apptOv = document.getElementById('schApptOverlay');
      apptOv.addEventListener('input', () => this.updateSaveBtn());
      apptOv.addEventListener('change', () => this.updateSaveBtn());
      // 고객 검색
      document.getElementById('schCustSearchBtn').onclick = () => this.runCustomerSearch();
      document.getElementById('schCustResetBtn').onclick = () => {
        this.renderCondFields();
        document.getElementById('schCustResults').innerHTML = '<div style="padding:14px;color:var(--gray-400);font-size:12px">검색 결과가 여기에 표시됩니다.</div>';
      };
      document.getElementById('schCustPick').onclick = () => {
        if (!this._selVisit) return;
        this.pending = this._selVisit; this.updateCustLabel(); this.updateSaveBtn(); closeOv('schCustOverlay');
      };
      // 검색조건 순서 조정 (드래그)
      document.getElementById('schCustCondBtn').onclick = () => this.openCondReorder();
      document.getElementById('schCondSaveBtn').onclick = () => {
        const order = [...document.querySelectorAll('#schCondList li')].map((li) => li.dataset.key);
        saveCondOrder(order);
        this.renderCondFields();
        closeOv('schCondOverlay');
        MxAlert.toast('검색조건 순서가 저장되었습니다.', 'success');
      };
      document.getElementById('schCondResetBtn').onclick = () => this._renderCondList(SCH_CONDS.map((c) => c.key));
      const condList = document.getElementById('schCondList');
      condList.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragEl = this._condDragEl;
        if (!dragEl) return;
        const after = this._condAfter(condList, e.clientY);
        if (after == null) condList.appendChild(dragEl); else condList.insertBefore(dragEl, after);
      });
    }

    // ── 검색조건 필드 렌더 (순서: localStorage) ───────────────
    renderCondFields() {
      const box = document.getElementById('schCustFields');
      box.innerHTML = getCondOrder().map((key) => {
        const c = condByKey(key);
        return `<div class="sch-cond-field">
          <label class="form-label">${c.label}</label>
          <input type="text" class="form-control" id="schCond_${c.key}" data-cond="${c.key}" placeholder="${c.placeholder}" autocomplete="off">
        </div>`;
      }).join('');
      box.querySelectorAll('input[data-cond]').forEach((inp) => {
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.runCustomerSearch(); });
        // 3자 이상 입력 시 실시간 고객 목록 표시
        inp.addEventListener('input', () => { clearTimeout(this._liveTimer); this._liveTimer = setTimeout(() => this.liveSearch(), 250); });
      });
    }
    // 3자 이상인 조건만 모아 실시간 검색
    liveSearch() {
      const parts = [];
      SCH_CONDS.forEach((c) => {
        const el = document.getElementById('schCond_' + c.key);
        const v = el ? el.value.trim() : '';
        if (v.length >= 3) parts.push(`${c.param}=${encodeURIComponent(v)}`);
      });
      if (!parts.length) {
        document.getElementById('schCustResults').innerHTML = '<div style="padding:14px;color:var(--gray-400);font-size:12px">검색어를 3자 이상 입력하면 대상 고객이 표시됩니다.</div>';
        return;
      }
      this._doCustomerSearch(parts);
    }

    // 검색조건 순서 조정 모달
    openCondReorder() { this._renderCondList(getCondOrder()); openOv('schCondOverlay'); }
    _renderCondList(order) {
      const list = document.getElementById('schCondList');
      list.innerHTML = order.map((key, i) => {
        const c = condByKey(key);
        return `<li draggable="true" data-key="${key}"><span class="sch-cond-handle">⋮⋮</span><span class="sch-cond-num">${i + 1}</span><span>${c.label}</span></li>`;
      }).join('');
      list.querySelectorAll('li').forEach((li) => {
        li.addEventListener('dragstart', () => { this._condDragEl = li; setTimeout(() => li.classList.add('dragging'), 0); });
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); this._condDragEl = null; this._renumberCond(); });
      });
    }
    _condAfter(list, y) {
      let closest = { offset: -Infinity, el: null };
      list.querySelectorAll('li:not(.dragging)').forEach((child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) closest = { offset, el: child };
      });
      return closest.el;
    }
    _renumberCond() { document.querySelectorAll('#schCondList li .sch-cond-num').forEach((n, i) => { n.textContent = i + 1; }); }


    // 등록된 일정이 현재 의사 필터에 가려지지 않도록 — 다른 의사면 '전체'로 전환
    ensureVisible(doctorId) {
      if (this.doctorId && String(this.doctorId) !== String(doctorId)) {
        this.doctorId = '';
        const ds = this.root.querySelector('#schDoctor');
        if (ds) ds.value = '';
      }
    }

    // 해당 의사·날짜에서 fromMin 이후 dur 길이로 비어있는 가장 빠른 슬롯
    nextFreeSlot(doctorId, date, fromMin, dur) {
      const busy = this.appts
        .filter((a) => a && a.start_at && a.end_at && String(a.doctor_id) === String(doctorId) && a.start_at.slice(0, 10) === date)
        .map((a) => ({ s: splitDt(a.start_at).min, e: splitDt(a.end_at).min }))
        .sort((a, b) => a.s - b.s);
      let start = Math.max(fromMin, this.dayStart);
      start = Math.ceil(start / this.snap) * this.snap;
      while (start + dur <= this.dayEnd) {
        const hit = busy.find((b) => start < b.e && start + dur > b.s);
        if (!hit) return { start, end: start + dur };
        start = Math.ceil(hit.e / this.snap) * this.snap; // 충돌 블록 끝으로 점프
      }
      return null;
    }

    // 저장 후: 다음 가용 "시작시간만" 세팅하고 나머지 항목은 초기화
    resetForNextEntry(doctorId, date, prevEnd) {
      // 같은 날, 방금 저장한 종료시각(prevEnd) 이후의 가장 빠른 빈 시작시간 (예외에도 prevEnd 보장)
      let nextStart = Math.min(prevEnd, this.dayEnd);
      try { const slot = this.nextFreeSlot(doctorId, date, prevEnd, this.snap); if (slot) nextStart = slot.start; } catch (e) {}
      // ★ 핵심: 같은 날 + 다음 시작시간을 가장 먼저 세팅 (예: 13:00)
      document.getElementById('schApptDate').value = date;
      document.getElementById('schApptStart').value = minToTime(nextStart);
      document.getElementById('schApptEnd').value = '';
      document.getElementById('schApptTitle').textContent = '일정 등록'; // 신규 등록 모드
      document.getElementById('schApptDelete').style.display = 'none';
      // 나머지 초기화 (의사 유지)
      const consult = document.querySelector('input[name="schStatus"][value="consulting"]');
      if (consult) consult.checked = true;
      this.pending = null; this.updateCustLabel();
      document.getElementById('schApptNote').value = '';
      document.getElementById('schApptDateTo').value = '';
      this.applyStatusUI();
      this.clearFieldErrors();
      this._formSnapshot = this.snapshotForm(); // 다음 입력 기준 스냅샷
      this.updateSaveBtn();
    }

    async saveAppt() {
      const status = this.curStatus();
      const doctorId = document.getElementById('schApptDoctor').value;
      const note = document.getElementById('schApptNote').value || null;
      const st = parseTimeInput(document.getElementById('schApptStart').value);
      const et = parseTimeInput(document.getElementById('schApptEnd').value);
      if (!st) return MxAlert.error('시작 시간을 숫자(예: 1335) 또는 시계로 입력하세요.');
      if (!et) return MxAlert.error('종료 시간을 숫자(예: 1420) 또는 시계로 입력하세요.');
      if (timeToMin(et) <= timeToMin(st)) return MxAlert.error('종료 시간은 시작 시간보다 뒤여야 합니다.');

      // 부재중(휴가): 시작일~종료일 기간 동안 일자별 생성
      if (status === 'absent') return this.saveAbsent(doctorId, note, st, et);

      const ymd = parseDateInput(document.getElementById('schApptDate').value);
      if (!ymd) return MxAlert.error('날짜를 숫자 8자리(예: 20260607) 또는 달력으로 입력하세요.');
      if (!this.pending) return MxAlert.error('진료/수술 일정에는 고객을 선택하세요.');
      if (isPast(ymd, st)) return MxAlert.error('지난 시간대에는 일정을 설정할 수 없습니다.');
      if (!await MxAlert.confirm('저장하시겠습니까?')) return;
      const payload = {
        doctor_id: doctorId, status,
        start_at: dtStr(ymd, timeToMin(st)),
        end_at: dtStr(ymd, timeToMin(et)),
        note, visit_id: this.pending.visit_id,
      };
      try {
        if (this.editingId) {
          await apiSend('PUT', `/api/schedule/appointments/${this.editingId}`, payload);
          this.editingId = null; // 저장 후 다음은 신규 등록 모드
        } else {
          await apiSend('POST', '/api/schedule/appointments', payload);
        }
        schToast('저장되었습니다.');
        // 부모 달력 갱신(실패해도 진행) → 최신 데이터로 다음 가용 시작시간 세팅
        this.ensureVisible(doctorId);
        try { await this.load(); } catch (e) {}
        this.resetForNextEntry(doctorId, ymd, timeToMin(et));
      } catch (e) { MxAlert.error(e.message); }
    }

    async saveAbsent(doctorId, note, st, et) {
      const from = parseDateInput(document.getElementById('schApptDate').value);
      let to = parseDateInput(document.getElementById('schApptDateTo').value);
      if (!from) return MxAlert.error('시작일을 숫자 8자리(예: 20260607) 또는 달력으로 입력하세요.');
      if (!to) to = from; // 종료일 미입력 시 하루
      if (parseYMD(to) < parseYMD(from)) return MxAlert.error('종료일은 시작일보다 같거나 뒤여야 합니다.');
      const title = note || '부재';

      // 수정: 단일 일자 블록만 갱신
      if (this.editingId) {
        if (isPast(from, et)) return MxAlert.error('지난 시간대에는 일정을 설정할 수 없습니다.');
        if (!await MxAlert.confirm('저장하시겠습니까?')) return;
        try {
          await apiSend('PUT', `/api/schedule/appointments/${this.editingId}`,
            { status: 'absent', start_at: dtStr(from, timeToMin(st)), end_at: dtStr(from, timeToMin(et)), note, title });
          this.editingId = null;
          schToast('저장되었습니다.');
          this.ensureVisible(doctorId);
          try { await this.load(); } catch (e) {}
          this.resetForNextEntry(doctorId, from, timeToMin(et)); // 다음 가용 시작시간 세팅
        } catch (e) { MxAlert.error(e.message); }
        return;
      }

      // 신규: 기간 내 일자별로 생성
      if (isPast(to, et)) return MxAlert.error('지난 시간대에는 일정을 등록할 수 없습니다.');
      const days = [];
      for (let c = parseYMD(from), end = parseYMD(to); c <= end; c = addDays(c, 1)) days.push(fmtDate(c));
      if (days.length > 60) return MxAlert.error('부재(휴가) 기간은 최대 60일까지 한 번에 등록할 수 있습니다.');
      if (!await MxAlert.confirm(`부재(휴가) ${days.length}일을 저장하시겠습니까?`)) return;

      const failed = [];
      for (const day of days) {
        try {
          await apiSend('POST', '/api/schedule/appointments',
            { doctor_id: doctorId, status: 'absent', start_at: dtStr(day, timeToMin(st)), end_at: dtStr(day, timeToMin(et)), note, title });
        } catch (e) { failed.push(`${day} — ${e.message}`); }
      }

      if (failed.length === days.length) {
        return MxAlert.error('부재(휴가) 등록에 실패했습니다.\n' + failed.join('\n'));
      }
      this.ensureVisible(doctorId);
      this.load(); // 모달 유지(연속 등록)
      if (failed.length) MxAlert.alert(`총 ${days.length}일 중 ${days.length - failed.length}일 등록 완료. 아래 날짜는 기존 일정이 있어 제외되었습니다:\n\n${failed.join('\n')}`);
      else schToast(`부재(휴가) ${days.length}일이 등록되었습니다.`);
    }
    async deleteAppt() {
      if (!this.editingId) return;
      if (!(await MxAlert.confirm('이 일정을 삭제하시겠습니까?'))) return;
      try { await apiSend('DELETE', `/api/schedule/appointments/${this.editingId}`); MxAlert.toast('삭제되었습니다.', 'success'); closeOv('schApptOverlay'); this.load(); }
      catch (e) { MxAlert.error(e.message); }
    }

    // 고객 검색
    openCustomerSearch() {
      this._selVisit = null;
      document.getElementById('schCustPick').disabled = true;
      document.getElementById('schCustResults').innerHTML = '<div style="padding:14px;color:var(--gray-400);font-size:12px">검색어를 3자 이상 입력하면 대상 고객이 표시됩니다.</div>';
      document.getElementById('schCustInfo').innerHTML = '<div style="color:var(--gray-400);font-size:12px">고객을 선택하면 기본정보·문진이 표시됩니다.</div>';
      this.renderCondFields();
      openOv('schCustOverlay');
      setTimeout(() => { const f = document.querySelector('#schCustFields input'); if (f) f.focus(); }, 60);
    }
    async runCustomerSearch() {
      const parts = [];
      SCH_CONDS.forEach((c) => {
        const el = document.getElementById('schCond_' + c.key);
        const v = el ? el.value.trim() : '';
        if (v) parts.push(`${c.param}=${encodeURIComponent(v)}`);
      });
      if (!parts.length) return MxAlert.toast('검색어를 입력하세요.', 'warning');
      this._doCustomerSearch(parts);
    }
    async _doCustomerSearch(parts) {
      const box = document.getElementById('schCustResults');
      box.innerHTML = '<div style="padding:14px;color:var(--gray-400);font-size:12px">검색 중...</div>';
      try {
        const d = await apiGet(`/api/schedule/customer-search?${parts.join('&')}`);
        if (!d.data.length) { box.innerHTML = '<div style="padding:14px;color:var(--gray-400);font-size:12px">검색 결과가 없습니다.</div>'; return; }
        box.innerHTML = d.data.map((r, i) => `<div class="sch-res-item" data-i="${i}">
          <div style="font-weight:600">${esc(r.name || '(이름없음)')} <span style="font-size:11px;color:${r.account_id ? '#15803d' : '#9ca3af'}">${r.account_id ? '● 계정有' : '○ 계정無'}</span></div>
          <div style="font-size:12px;color:var(--gray-500)">${r.hospital_patient_id ? 'ID:' + esc(r.hospital_patient_id) + ' · ' : ''}${esc(r.email || '')}${r.mobile ? ' · ' + esc(fmtPhone(r.mobile)) : ''}</div>
          <div style="font-size:11px;color:var(--gray-400)">최근방문 ${r.visited_at || '-'}</div>
        </div>`).join('');
        box.querySelectorAll('.sch-res-item').forEach((it) => {
          it.onclick = () => {
            box.querySelectorAll('.sch-res-item').forEach((x) => x.classList.remove('sel'));
            it.classList.add('sel');
            this.selectCustomer(d.data[+it.dataset.i]);
          };
        });
      } catch (e) { box.innerHTML = `<div style="padding:14px;color:#dc2626;font-size:12px">${esc(e.message)}</div>`; }
    }
    async selectCustomer(r) {
      this._selVisit = { visit_id: r.visit_id, name: r.name, email: r.email, hospital_patient_id: r.hospital_patient_id };
      document.getElementById('schCustPick').disabled = false;
      const info = document.getElementById('schCustInfo');
      info.innerHTML = '<div style="color:var(--gray-400);font-size:12px">불러오는 중...</div>';
      try {
        const d = await apiGet(`/api/schedule/customer/${r.visit_id}/info`);
        const c = d.info;
        const kv = (k, v) => v ? `<div class="sch-kv"><b>${k}</b><span>${esc(String(v))}</span></div>` : '';
        let html = '<div style="font-weight:700;margin-bottom:6px">기본정보</div>';
        html += kv('이름', c.name) + kv('병원ID', c.hospital_patient_id) + kv('이메일', c.email) + kv('연락처', fmtPhone(c.mobile || c.phone)) +
          kv('성별', c.gender === 'M' ? '남' : c.gender === 'F' ? '여' : '') + kv('생년월일', c.birth_ymd) + kv('국적', c.nationality) +
          kv('담당의사', c.doctor_name) + kv('담당자', c.manager_name) + kv('캠페인', c.campaign_name);
        html += `<div style="font-weight:700;margin:10px 0 4px">문진 (${d.surveys.length})</div>`;
        if (!d.surveys.length) html += '<div style="font-size:12px;color:var(--gray-400)">제출된 문진이 없습니다.</div>';
        d.surveys.forEach((s) => {
          const qmap = {}; (s.survey_questions || []).forEach((qq, i) => qmap[qq.id != null ? qq.id : i] = qq.label || qq.title || qq.text || ('문항' + (i + 1)));
          const ansHtml = (s.answers || []).map((a) => {
            const label = qmap[a.qid != null ? a.qid : (a.id != null ? a.id : '')] || a.label || a.question || '';
            const val = Array.isArray(a.value) ? a.value.join(', ') : (a.value != null ? a.value : (a.answer != null ? a.answer : ''));
            return `<div class="qa"><b>${esc(String(label))}</b> ${esc(String(val))}</div>`;
          }).join('');
          html += `<details class="sch-survey"><summary>${esc(s.survey_title || '문진')} · ${s.submitted_at}</summary>${ansHtml || '<div class="qa" style="color:var(--gray-400)">응답 없음</div>'}</details>`;
        });
        info.innerHTML = html;
      } catch (e) { info.innerHTML = `<div style="color:#dc2626;font-size:12px">${esc(e.message)}</div>`; }
    }

    // ── 휴일 관리 (관리자) ───────────────────────────────────
    openHoliday(ymd) {
      const eff = this.holidays[ymd];
      const body = document.getElementById('schHolBody');
      document.getElementById('schHolTitle').textContent = `휴일 관리 — ${ymd}`;
      let state, desc, btns = '';
      if (!eff) {
        desc = '현재 <b>근무일</b>입니다.';
        btns = `<button class="btn btn-danger" data-act="close">휴무일로 지정</button>`;
      } else if (eff.effective_type === 'working') {
        desc = `공휴일(${esc(eff.name || '')})이지만 <b>근무일</b>로 지정되어 있습니다.`;
        btns = `<button class="btn btn-ghost" data-act="revert">기본(휴무)으로 복원</button>`;
      } else { // closed
        if (eff.is_national && !eff.is_override) {
          desc = `공휴일(${esc(eff.name || '')}) — 기본 <b>휴무</b>입니다.`;
          btns = `<button class="btn btn-primary" data-act="work">근무일로 전환</button>`;
        } else {
          desc = `관리자 지정 <b>휴무일</b>${eff.name ? ' (' + esc(eff.name) + ')' : ''}입니다.`;
          btns = `<button class="btn btn-ghost" data-act="revert">휴무 해제(복원)</button>`;
        }
      }
      body.innerHTML = `<p style="font-size:13px;margin:0 0 16px">${desc}</p><div style="display:flex;gap:8px;justify-content:flex-end">${btns}</div>`;
      body.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => this.holidayAction(ymd, b.dataset.act));
      openOv('schHolidayOverlay');
    }
    async holidayAction(ymd, act, force) {
      try {
        if (act === 'revert') await apiSend('DELETE', `/api/holidays/override/${ymd}`);
        else {
          const day_type = act === 'work' ? 'working' : 'closed';
          const name = act === 'close' ? '임시휴무' : null;
          await apiSend('POST', '/api/holidays/override', { date: ymd, day_type, name, force: !!force });
        }
        closeOv('schHolidayOverlay'); MxAlert.toast('적용되었습니다.', 'success'); this.load();
      } catch (e) {
        if (e.payload && e.payload.needsConfirm) {
          if (await MxAlert.confirm(e.message + '\n계속하시겠습니까?')) return this.holidayAction(ymd, act, true);
          return;
        }
        MxAlert.error(e.message);
      }
    }
  }

  // 하루 컬럼 내 겹침 레이아웃(레인 배치)
  function layoutDay(events) {
    events.sort((a, b) => a.s - b.s || a.e - b.e);
    let cluster = [], curEnd = -1;
    const clusters = [];
    events.forEach((ev) => {
      if (cluster.length && ev.s >= curEnd) { clusters.push(cluster); cluster = []; curEnd = -1; }
      cluster.push(ev); curEnd = Math.max(curEnd, ev.e);
    });
    if (cluster.length) clusters.push(cluster);
    clusters.forEach((cl) => {
      const laneEnds = [];
      cl.forEach((ev) => {
        let placed = false;
        for (let i = 0; i < laneEnds.length; i++) { if (ev.s >= laneEnds[i]) { ev.lane = i; laneEnds[i] = ev.e; placed = true; break; } }
        if (!placed) { ev.lane = laneEnds.length; laneEnds.push(ev.e); }
      });
      cl.forEach((ev) => ev.cols = laneEnds.length);
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // 대시보드 탭에서 호출
  let _instance = null;
  window.initSchedule = function (opts) {
    const root = document.getElementById('calendarRoot');
    if (!root) return;
    if (_instance) { _instance.load(); return; }   // 이미 초기화됨 → 새로고침
    _instance = new ScheduleCalendar(root, opts || {});
    _instance.init();
  };
  window.ScheduleCalendar = ScheduleCalendar;
})();
