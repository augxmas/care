import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import {
  requireScheduleViewer,
  requireScheduler,
  requireCustomer,
} from '../middleware/auth';
import { getActor } from '../utils/actor';
import { getHolidayMap } from '../utils/holidays';
import { sendEmail } from '../services/email.service';
import { generateTempPassword } from '../utils/password';

const router = Router();

const STATUSES = ['consulting', 'operating', 'absent'] as const;
type Status = typeof STATUSES[number];

const DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

function advId(req: Request): number { return (req.session as any).advertiser.id; }
function sessRole(req: Request): string { return (req.session as any).user?.role || 'advertiser'; }
function sessUserId(req: Request): number { return (req.session as any).user?.id; }

// 'YYYY-MM-DD HH:MM[:SS]' → 'YYYY-MM-DD HH:MM:SS'
function normDt(s: any): string | null {
  const v = String(s || '').trim();
  if (!DT_RE.test(v)) return null;
  return v.length === 16 ? v + ':00' : v;
}
function dtDate(s: string): string { return s.slice(0, 10); }
function dtTime(s: string): string { return s.slice(11, 16); }
function statusLabel(s: Status): string {
  return s === 'consulting' ? '진료' : s === 'operating' ? '수술' : '부재중';
}

// ── 의사 경량 목록 (달력 셀렉터/범례) ──────────────────────
router.get('/doctors', requireScheduleViewer, async (req: Request, res: Response) => {
  const role = sessRole(req);
  let where = 'WHERE advertiser_id = ? AND is_deleted = 0 AND status = \'active\'';
  const params: any[] = [advId(req)];
  if (role === 'doctor') { where += ' AND id = ?'; params.push(sessUserId(req)); }
  const [rows] = await pool.execute<any[]>(
    `SELECT id, name, specialty FROM doctors ${where} ORDER BY name`, params
  );
  res.json({ ok: true, data: rows });
});

// ── 일정 대시보드 통계 ──────────────────────────────────────
// 금일/이번주 진료(consulting)·시술(operating) 건수, 금일 부재중 의사 수
router.get('/dashboard-stats', requireScheduleViewer, async (req: Request, res: Response) => {
  const adv = advId(req);
  const role = sessRole(req);
  let scope = '';
  const params: any[] = [adv];
  if (role === 'doctor') { scope = ' AND ap.doctor_id = ?'; params.push(sessUserId(req)); }

  const [rows] = await pool.execute<any[]>(
    `SELECT
       COALESCE(SUM(ap.status='consulting' AND DATE(ap.start_at)=CURDATE()),0)                   AS today_consulting,
       COALESCE(SUM(ap.status='operating'  AND DATE(ap.start_at)=CURDATE()),0)                   AS today_operating,
       COALESCE(SUM(ap.status='consulting' AND YEARWEEK(ap.start_at,1)=YEARWEEK(CURDATE(),1)),0) AS week_consulting,
       COALESCE(SUM(ap.status='operating'  AND YEARWEEK(ap.start_at,1)=YEARWEEK(CURDATE(),1)),0) AS week_operating
     FROM appointments ap
     WHERE ap.advertiser_id=? AND ap.is_deleted=0${scope}`, params);

  const [ab] = await pool.execute<any[]>(
    `SELECT COUNT(DISTINCT ap.doctor_id) AS absent_doctors
       FROM appointments ap
      WHERE ap.advertiser_id=? AND ap.is_deleted=0 AND ap.status='absent'
        AND ap.start_at < (CURDATE() + INTERVAL 1 DAY) AND ap.end_at >= CURDATE()${scope}`, params);

  const r: any = rows[0] || {};
  res.json({
    ok: true,
    today_consulting: Number(r.today_consulting) || 0,
    today_operating:  Number(r.today_operating)  || 0,
    week_consulting:  Number(r.week_consulting)  || 0,
    week_operating:   Number(r.week_operating)   || 0,
    absent_doctors:   Number(ab[0].absent_doctors) || 0,
  });
});

// ── 일정 조회 ──────────────────────────────────────────────
// GET /appointments?from=&to=&doctor_id=
router.get('/appointments', requireScheduleViewer, async (req: Request, res: Response) => {
  const adv = advId(req);
  const role = sessRole(req);
  const from = normDt(String(req.query.from || '') + ' 00:00') || null;
  const to   = normDt(String(req.query.to   || '') + ' 23:59') || null;
  if (!from || !to) return res.status(400).json({ error: 'from/to(YYYY-MM-DD)를 확인하세요.' });

  let where = 'WHERE ap.advertiser_id = ? AND ap.is_deleted = 0 AND ap.start_at <= ? AND ap.end_at >= ?';
  const params: any[] = [adv, to, from];

  if (role === 'doctor') {
    where += ' AND ap.doctor_id = ?';
    params.push(sessUserId(req)); // 의사는 본인 일정만(클라이언트 doctor_id 무시)
  } else if (req.query.doctor_id) {
    where += ' AND ap.doctor_id = ?';
    params.push(parseInt(String(req.query.doctor_id)));
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT ap.id, ap.doctor_id, ap.manager_id, ap.customer_id, ap.visit_id,
            ap.status, ap.title, ap.note,
            DATE_FORMAT(ap.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(ap.end_at,   '%Y-%m-%d %H:%i:%s') AS end_at,
            ap.notified_at,
            d.name  AS doctor_name,
            d.specialty AS doctor_specialty,
            m.name  AS manager_name,
            cv.name AS customer_name, cv.hospital_patient_id, cv.email AS customer_email,
            cv.nationality AS customer_nationality
       FROM appointments ap
       LEFT JOIN doctors  d  ON d.id  = ap.doctor_id
       LEFT JOIN managers m  ON m.id  = ap.manager_id
       LEFT JOIN customer_visits cv ON cv.id = ap.visit_id
       ${where}
       ORDER BY ap.start_at`,
    params
  );
  res.json({ ok: true, data: rows });
});

// 의사 소속 확인
async function doctorOwned(adv: number, doctorId: number): Promise<boolean> {
  const [r] = await pool.execute<any[]>(
    'SELECT 1 FROM doctors WHERE id = ? AND advertiser_id = ? AND is_deleted = 0', [doctorId, adv]
  );
  return r.length > 0;
}

// visit_id 로 고객 방문 정보 조회 (병원 격리)
async function getVisit(adv: number, visitId: number): Promise<any | null> {
  const [r] = await pool.execute<any[]>(
    `SELECT cv.id, cv.name, cv.email, cv.mobile, cv.hospital_patient_id
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE cv.id = ? AND c.advertiser_id = ?`,
    [visitId, adv]
  );
  return r.length ? r[0] : null;
}

// 고객 로그인 계정 확보(없으면 자동생성). { customerId, created, tempPassword }
async function resolveCustomer(adv: number, visit: any): Promise<{ customerId: number | null; created: boolean; tempPassword: string }> {
  if (!visit.email) return { customerId: null, created: false, tempPassword: '' };
  const [exist] = await pool.execute<any[]>(
    'SELECT id FROM customers WHERE advertiser_id = ? AND email = ? AND is_deleted = 0', [adv, visit.email]
  );
  if (exist.length) return { customerId: exist[0].id, created: false, tempPassword: '' };

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, 12);
  try {
    const [r]: any = await pool.execute(
      `INSERT INTO customers (advertiser_id, visit_id, hospital_patient_id, name, email, password_hash, mobile, auto_created, password_reset_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
      [adv, visit.id, visit.hospital_patient_id || null, visit.name || null, visit.email, hash, visit.mobile || null]
    );
    return { customerId: r.insertId, created: true, tempPassword };
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') {
      const [again] = await pool.execute<any[]>(
        'SELECT id FROM customers WHERE advertiser_id = ? AND email = ?', [adv, visit.email]
      );
      return { customerId: again.length ? again[0].id : null, created: false, tempPassword: '' };
    }
    throw e;
  }
}

function buildEmailVars(opts: {
  customerName: string; companyName: string; doctorName: string; status: Status;
  start: string; end: string; managerName: string; adv: number;
}): Record<string, string> {
  const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    name:        opts.customerName || '고객',
    hospital_name: opts.companyName || '병원',
    doctor_name: opts.doctorName || '',
    appt_type:   statusLabel(opts.status),
    date:        dtDate(opts.start),
    start_time:  dtTime(opts.start),
    end_time:    dtTime(opts.end),
    manager_name: opts.managerName || '',
    login_url:   `${base}/my-schedule?h=${opts.adv}`,
  };
}

// 통보 메일 발송(비치명적). 성공 시 notified_at 갱신.
async function notifyCustomer(apptId: number, email: string, templateKey: string, vars: Record<string, string>, adv: number) {
  try {
    await sendEmail({ templateKey, to: email, vars, advertiserId: adv });
    await pool.execute('UPDATE appointments SET notified_at = NOW() WHERE id = ?', [apptId]);
  } catch (e) {
    console.error('[schedule] 통보 메일 실패:', (e as any)?.message);
  }
}

// ── 일정 생성 ──────────────────────────────────────────────
router.post('/appointments', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const status = STATUSES.includes(req.body.status) ? (req.body.status as Status) : null;
  const doctorId = parseInt(req.body.doctor_id);
  const start = normDt(req.body.start_at);
  const end   = normDt(req.body.end_at);
  // 담당자가 생성하면 본인을 기본 담당자로 지정
  const managerId = req.body.manager_id ? parseInt(req.body.manager_id)
    : (sessRole(req) === 'manager' ? sessUserId(req) : null);
  const visitId = req.body.visit_id ? parseInt(req.body.visit_id) : null;
  const title = req.body.title ? String(req.body.title).slice(0, 200) : null;
  const note  = req.body.note ? String(req.body.note) : null;

  if (!status) return res.status(400).json({ error: '상태(진료중/수술중/부재중)를 확인하세요.' });
  if (!doctorId) return res.status(400).json({ error: '의사를 선택하세요.' });
  if (!start || !end) return res.status(400).json({ error: '시작/종료 시간 형식이 올바르지 않습니다.' });
  if (end <= start) return res.status(400).json({ error: '종료 시간은 시작 시간보다 뒤여야 합니다.' });
  if (dtDate(start) !== dtDate(end)) return res.status(400).json({ error: '일정은 같은 날짜 안에서만 설정할 수 있습니다.' });

  // 지난 시간대 등록 금지 (DB NOW() 기준 — 저장 데이터와 동일 시계)
  const [pastRows] = await pool.execute<any[]>('SELECT (? < NOW()) AS past', [start]);
  if (pastRows[0].past) return res.status(400).json({ error: '지난 시간대에는 일정을 등록할 수 없습니다.' });

  if (!(await doctorOwned(adv, doctorId))) return res.status(400).json({ error: '의사를 찾을 수 없습니다.' });

  // 휴무일 확인 (관리자 오버라이드 working 이면 통과)
  const map = await getHolidayMap(adv, dtDate(start), dtDate(start));
  const eff = map[dtDate(start)];
  if (eff && eff.effective_type === 'closed') {
    return res.status(400).json({ error: `휴무일(${eff.name || ''})에는 일정을 설정할 수 없습니다.` });
  }

  // 고객 처리 (부재중이면 고객 없음)
  let visit: any = null;
  if (status !== 'absent') {
    if (!visitId) return res.status(400).json({ error: '진료/수술 일정에는 고객을 선택해야 합니다.' });
    visit = await getVisit(adv, visitId);
    if (!visit) return res.status(400).json({ error: '고객 정보를 찾을 수 없습니다.' });
  }

  let customerId: number | null = null;
  let created = false;
  let tempPassword = '';
  if (visit) {
    const r = await resolveCustomer(adv, visit);
    customerId = r.customerId; created = r.created; tempPassword = r.tempPassword;
  }

  // 중복 검사 + 삽입 (트랜잭션 + FOR UPDATE)
  const conn = await pool.getConnection();
  let newId: number;
  try {
    await conn.beginTransaction();
    const [overlap] = await conn.execute<any[]>(
      `SELECT id, status FROM appointments
        WHERE doctor_id = ? AND is_deleted = 0
          AND start_at < ? AND end_at > ?
        FOR UPDATE`,
      [doctorId, end, start]
    );
    if (overlap.length) {
      await conn.rollback();
      const hasAbsent = overlap.some((o: any) => o.status === 'absent');
      if (status === 'absent') {
        return res.status(409).json({ error: '해당 시간에 진료/수술 일정이 있어 부재중으로 설정할 수 없습니다.' });
      }
      if (hasAbsent) {
        return res.status(409).json({ error: '해당 시간에 의사가 부재중(휴가/연차)입니다. 예약을 설정할 수 없습니다.' });
      }
      return res.status(409).json({ error: '해당 시간에 이미 다른 일정이 있습니다.' });
    }

    const [ins]: any = await conn.execute(
      `INSERT INTO appointments
        (advertiser_id, doctor_id, manager_id, customer_id, visit_id, status, title, start_at, end_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [adv, doctorId, managerId, customerId, visit ? visit.id : null, status, title, start, end, note, getActor(req)]
    );
    newId = ins.insertId;
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ error: '저장에 실패했습니다.' });
  } finally {
    conn.release();
  }

  // 통보 메일 (커밋 후, 비치명적)
  if (visit && visit.email) {
    const [drow] = await pool.execute<any[]>('SELECT name FROM doctors WHERE id = ?', [doctorId]);
    const adv0: any = (req.session as any).advertiser;
    const vars = buildEmailVars({
      customerName: visit.name, companyName: adv0.company_name, doctorName: drow[0]?.name,
      status, start, end, managerName: (req.session as any).user?.name, adv,
    });
    if (created) {
      vars.email = visit.email;
      vars.temp_password = tempPassword;
      vars.advertiser_id = String(adv);
      await notifyCustomer(newId, visit.email, 'appointment_created_with_account', vars, adv);
    } else {
      await notifyCustomer(newId, visit.email, 'appointment_notification', vars, adv);
    }
  }

  res.json({ ok: true, id: newId });
});

// ── 일정 수정 (이동/리사이즈/내용) ─────────────────────────
router.put('/appointments/:id', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const id = parseInt(req.params.id);

  const [cur] = await pool.execute<any[]>(
    `SELECT id, doctor_id, status, visit_id, customer_id,
            DATE_FORMAT(start_at,'%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(end_at,  '%Y-%m-%d %H:%i:%s') AS end_at
       FROM appointments WHERE id = ? AND advertiser_id = ? AND is_deleted = 0`,
    [id, adv]
  );
  if (!cur.length) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  const row = cur[0];

  const status = req.body.status !== undefined
    ? (STATUSES.includes(req.body.status) ? req.body.status as Status : null)
    : (row.status as Status);
  if (!status) return res.status(400).json({ error: '상태 값이 올바르지 않습니다.' });
  const start = req.body.start_at !== undefined ? normDt(req.body.start_at) : row.start_at;
  const end   = req.body.end_at   !== undefined ? normDt(req.body.end_at)   : row.end_at;
  if (!start || !end) return res.status(400).json({ error: '시간 형식이 올바르지 않습니다.' });
  if (end <= start) return res.status(400).json({ error: '종료 시간은 시작 시간보다 뒤여야 합니다.' });
  if (dtDate(start) !== dtDate(end)) return res.status(400).json({ error: '일정은 같은 날짜 안에서만 설정할 수 있습니다.' });
  // 지난 일정 수정 / 과거로 이동 금지 (start 미변경 시에도 기존 start 기준)
  const [putPast] = await pool.execute<any[]>('SELECT (? < NOW()) AS past', [start]);
  if (putPast[0].past) return res.status(400).json({ error: '지난 시간대의 일정은 수정할 수 없습니다.' });
  const title = req.body.title !== undefined ? (req.body.title ? String(req.body.title).slice(0, 200) : null) : undefined;
  const note  = req.body.note  !== undefined ? (req.body.note ? String(req.body.note) : null) : undefined;

  // 휴무일 확인
  const map = await getHolidayMap(adv, dtDate(start), dtDate(start));
  const eff = map[dtDate(start)];
  if (eff && eff.effective_type === 'closed') {
    return res.status(400).json({ error: `휴무일(${eff.name || ''})에는 일정을 설정할 수 없습니다.` });
  }

  // 고객 재지정 (visit_id 전달 시)
  let visit: any = null;
  let newVisitId = row.visit_id;
  let newCustomerId = row.customer_id;
  if (status === 'absent') {
    newVisitId = null; newCustomerId = null;
  } else if (req.body.visit_id !== undefined) {
    const vid = req.body.visit_id ? parseInt(req.body.visit_id) : null;
    if (!vid) return res.status(400).json({ error: '진료/수술 일정에는 고객이 필요합니다.' });
    visit = await getVisit(adv, vid);
    if (!visit) return res.status(400).json({ error: '고객 정보를 찾을 수 없습니다.' });
    const r = await resolveCustomer(adv, visit);
    newVisitId = visit.id; newCustomerId = r.customerId;
  } else if (!row.visit_id) {
    return res.status(400).json({ error: '진료/수술 일정에는 고객이 필요합니다.' });
  }

  const timeChanged = (start !== row.start_at || end !== row.end_at);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [overlap] = await conn.execute<any[]>(
      `SELECT id, status FROM appointments
        WHERE doctor_id = ? AND is_deleted = 0 AND id <> ?
          AND start_at < ? AND end_at > ?
        FOR UPDATE`,
      [row.doctor_id, id, end, start]
    );
    if (overlap.length) {
      await conn.rollback();
      const hasAbsent = overlap.some((o: any) => o.status === 'absent');
      if (status === 'absent') return res.status(409).json({ error: '해당 시간에 진료/수술 일정이 있어 부재중으로 설정할 수 없습니다.' });
      if (hasAbsent) return res.status(409).json({ error: '해당 시간에 의사가 부재중(휴가/연차)입니다.' });
      return res.status(409).json({ error: '해당 시간에 이미 다른 일정이 있습니다.' });
    }

    const sets = ['status=?', 'start_at=?', 'end_at=?', 'visit_id=?', 'customer_id=?'];
    const vals: any[] = [status, start, end, newVisitId, newCustomerId];
    if (title !== undefined) { sets.push('title=?'); vals.push(title); }
    if (note  !== undefined) { sets.push('note=?');  vals.push(note); }
    vals.push(id, adv);
    await conn.execute(`UPDATE appointments SET ${sets.join(', ')} WHERE id=? AND advertiser_id=?`, vals);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ error: '수정에 실패했습니다.' });
  } finally {
    conn.release();
  }

  // 시간 변경 시 재통보
  if (status !== 'absent' && timeChanged && newCustomerId) {
    const [info] = await pool.execute<any[]>(
      `SELECT cv.name, cv.email, d.name AS doctor_name
         FROM appointments ap
         LEFT JOIN customer_visits cv ON cv.id = ap.visit_id
         LEFT JOIN doctors d ON d.id = ap.doctor_id
        WHERE ap.id = ?`, [id]
    );
    const em = info[0]?.email;
    if (em) {
      const adv0: any = (req.session as any).advertiser;
      const vars = buildEmailVars({
        customerName: info[0].name, companyName: adv0.company_name, doctorName: info[0].doctor_name,
        status, start, end, managerName: (req.session as any).user?.name, adv,
      });
      vars.old_datetime = `${row.start_at}`;
      vars.new_datetime = `${start}`;
      await notifyCustomer(id, em, 'appointment_rescheduled', vars, adv);
    }
  }

  res.json({ ok: true });
});

// ── 일정 삭제 (소프트) ─────────────────────────────────────
router.delete('/appointments/:id', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const id = parseInt(req.params.id);
  // 지난 시간대의 일정은 삭제 불가
  const [chk] = await pool.execute<any[]>(
    'SELECT (start_at < NOW()) AS past FROM appointments WHERE id=? AND advertiser_id=? AND is_deleted=0',
    [id, adv]
  );
  if (!chk.length) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  if (chk[0].past) return res.status(400).json({ error: '지난 시간대의 일정은 삭제할 수 없습니다.' });
  const [r]: any = await pool.execute(
    `UPDATE appointments SET is_deleted=1, deleted_at=NOW(), deleted_by=?
      WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [getActor(req), id, adv]
  );
  if (!r.affectedRows) return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// ── 고객 검색 (병원환자ID 재방문 / 이메일 최초) ────────────
router.get('/customer-search', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const hpid = req.query.hospital_patient_id ? String(req.query.hospital_patient_id).trim() : '';
  const email = req.query.email ? String(req.query.email).trim() : '';
  const name = req.query.name ? String(req.query.name).trim() : '';
  if (!hpid && !email && !name) return res.status(400).json({ error: '검색어를 입력하세요.' });

  // LIKE 메타문자 이스케이프
  const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);
  const conds: string[] = [];
  const condParams: any[] = [];
  if (hpid)  { conds.push("cv.hospital_patient_id LIKE CONCAT(?, '%')"); condParams.push(esc(hpid)); }   // 병원ID: 앞일치
  if (email) { conds.push("cv.email LIKE CONCAT(?, '%')"); condParams.push(esc(email)); }                 // 이메일: 앞일치
  if (name)  { conds.push("cv.name LIKE CONCAT('%', ?, '%')"); condParams.push(esc(name)); }              // 이름: 포함

  const [rows] = await pool.execute<any[]>(
    `SELECT cv.id AS visit_id, cv.name, cv.email, cv.mobile, cv.hospital_patient_id,
            cv.gender, cv.birth_ymd, cv.nationality,
            DATE_FORMAT(cv.visited_at, '%Y-%m-%d') AS visited_at,
            (SELECT cu.id FROM customers cu WHERE cu.advertiser_id = ? AND cu.email = cv.email AND cu.is_deleted = 0 LIMIT 1) AS account_id
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND ${conds.join(' AND ')}
      ORDER BY cv.visited_at DESC
      LIMIT 50`,
    [adv, adv, ...condParams]
  );
  res.json({ ok: true, data: rows });
});

// ── 고객 이메일 추천 (prefix, 3자 이상) ────────────────────
router.get('/customer-suggest', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const q = req.query.email ? String(req.query.email).trim() : '';
  if (q.length < 3) return res.json({ ok: true, data: [] });
  const esc = q.replace(/[\\%_]/g, (c) => '\\' + c); // LIKE 메타문자 이스케이프
  const [rows] = await pool.execute<any[]>(
    `SELECT cv.email, MAX(cv.name) AS name, MAX(cv.nationality) AS nationality, COUNT(*) AS visits
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND cv.email IS NOT NULL AND cv.email <> ''
        AND cv.email LIKE CONCAT(?, '%')
      GROUP BY cv.email
      ORDER BY cv.email
      LIMIT 10`,
    [adv, esc]
  );
  res.json({ ok: true, data: rows });
});

// ── 고객 기본정보 + 문진 ───────────────────────────────────
router.get('/customer/:visitId/info', requireScheduler, async (req: Request, res: Response) => {
  const adv = advId(req);
  const visitId = parseInt(req.params.visitId);

  const [vrows] = await pool.execute<any[]>(
    `SELECT cv.*,
            d.name AS doctor_name, m.name AS manager_name, c.campaign_name
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       LEFT JOIN doctors  d ON d.id = cv.doctor_id
       LEFT JOIN managers m ON m.id = cv.manager_id
      WHERE cv.id = ? AND c.advertiser_id = ?`,
    [visitId, adv]
  );
  if (!vrows.length) return res.status(404).json({ error: '고객 정보를 찾을 수 없습니다.' });
  const info = vrows[0];

  // 문진: matched_visit_id 또는 동일 이메일
  const [subs] = await pool.execute<any[]>(
    `SELECT ss.id, ss.survey_id, s.title AS survey_title,
            ss.answers, ss.personal_data,
            DATE_FORMAT(ss.submitted_at, '%Y-%m-%d %H:%i') AS submitted_at,
            s.questions AS survey_questions
       FROM survey_submissions ss
       INNER JOIN surveys s ON s.id = ss.survey_id
      WHERE ss.advertiser_id = ?
        AND (ss.matched_visit_id = ? OR (ss.email IS NOT NULL AND ss.email = ?))
      ORDER BY ss.submitted_at DESC`,
    [adv, visitId, info.email || '']
  );
  subs.forEach((r: any) => {
    try { r.answers          = r.answers          ? JSON.parse(r.answers)          : []; } catch { r.answers = []; }
    try { r.personal_data    = r.personal_data    ? JSON.parse(r.personal_data)    : {}; } catch { r.personal_data = {}; }
    try { r.survey_questions = r.survey_questions ? JSON.parse(r.survey_questions) : []; } catch { r.survey_questions = []; }
  });

  res.json({ ok: true, info, surveys: subs });
});

// ── 고객 본인 일정 조회 ────────────────────────────────────
router.get('/my-appointments', requireCustomer, async (req: Request, res: Response) => {
  const cust = (req.session as any).customer;
  const [rows] = await pool.execute<any[]>(
    `SELECT ap.id, ap.status, ap.title,
            DATE_FORMAT(ap.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(ap.end_at,   '%Y-%m-%d %H:%i:%s') AS end_at,
            d.name AS doctor_name, d.specialty,
            a.company_name AS hospital_name
       FROM appointments ap
       LEFT JOIN doctors d     ON d.id = ap.doctor_id
       LEFT JOIN advertisers a ON a.id = ap.advertiser_id
      WHERE ap.customer_id = ? AND ap.advertiser_id = ? AND ap.is_deleted = 0
        AND ap.status <> 'absent'
      ORDER BY ap.start_at DESC`,
    [cust.id, cust.advertiser_id]
  );
  res.json({ ok: true, data: rows });
});

export default router;
