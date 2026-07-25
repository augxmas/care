import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { sendEmail } from '../services/email.service';

const router = Router();

function normalizeMoney(raw: any, label: string): number {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}은 0보다 큰 숫자여야 합니다.`);
  return n;
}
function normalizeDiscountRate(raw: any): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('할인율은 0~100 사이의 숫자여야 합니다.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('할인율은 0~100 사이의 숫자여야 합니다.');
  return n;
}
function calcPaymentAmount(amount: number, discountRate: number): number {
  return Math.max(0, Math.round(amount * (100 - discountRate) / 100));
}

// 사용자 친화적 확인코드 생성 (10자, 혼동되는 문자 제외)
function genConfirmCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const DOCTOR_FIELDS = ['name','email','license_no','specialty','mobile','status'];
const MANAGER_FIELDS = ['name','email','department','position','mobile','status'];

function pick(obj: any, keys: string[]) {
  const out: any = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function listStaff(table: 'doctors'|'managers', req: Request, res: Response) {
  const adv = (req.session as any).advertiser;
  const { keyword, name, email, status, page = 1, size = 10 } = req.query;
  const fkCol = table === 'doctors' ? 'doctor_id' : 'manager_id';
  let where = 'WHERE s.advertiser_id = ? AND s.is_deleted = 0';
  const params: any[] = [adv.id];
  if (keyword) {  // 통합 검색(하위호환)
    where += ' AND (s.name LIKE ? OR s.email LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (name)  { where += ' AND s.name LIKE ?';  params.push(`%${name}%`); }
  if (email) { where += ' AND s.email LIKE ?'; params.push(`%${email}%`); }
  if (status) { where += ' AND s.status = ?'; params.push(status); }
  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM ${table} s ${where}`, params);
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT s.*,
            fn_decrypt(s.confirm_code_enc) AS confirm_code,
            (SELECT COUNT(*) FROM customer_visits cv WHERE cv.${fkCol} = s.id) AS total_visits,
            (SELECT COUNT(*) FROM customer_visits cv WHERE cv.${fkCol} = s.id AND cv.visit_type='treated') AS treated_visits
       FROM ${table} s ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  data.forEach((r: any) => { delete r.password_hash; delete r.confirm_code_enc; });
  res.json({ ok: true, data, total });
}

async function createStaff(table: 'doctors'|'managers', fields: string[], req: Request, res: Response) {
  const adv = (req.session as any).advertiser;
  const body = pick(req.body, fields);
  if (!body.name || !body.email) return res.status(400).json({ error: '이름과 이메일은 필수입니다.' });

  // 비밀번호 미입력 시 자동 생성된 확인코드 사용 (= 비밀번호)
  const explicit = req.body.password;
  const confirmCode = explicit ? String(explicit) : genConfirmCode();
  const passwordHash = await bcrypt.hash(confirmCode, 12);

  // confirm_code_enc 는 fn_encrypt 로 저장 (관리자 화면에서 복호화 노출)
  const cols = ['advertiser_id', ...Object.keys(body), 'password_hash'];
  const placeholders = ['?', ...Object.keys(body).map(() => '?'), '?'];
  const vals: any[] = [adv.id, ...Object.values(body), passwordHash];
  cols.push('confirm_code_enc');
  placeholders.push('fn_encrypt(?)');
  vals.push(confirmCode);

  try {
    const [result]: any = await pool.execute(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})`,
      vals
    );
    // 이메일 발송 (실패해도 등록은 성공으로 응답)
    try {
      await sendEmail({
        templateKey: 'staff_welcome',
        to: String(body.email),
        vars: {
          name:          String(body.name),
          email:         String(body.email),
          confirm_code:  confirmCode,
          company_name:  adv.company_name || '병원',
          role:          table === 'doctors' ? '의사' : '담당자',
        },
        advertiserId: adv.id,
      });
    } catch {}
    res.json({ ok: true, id: result.insertId });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
    console.error(e);
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
}

async function updateStaff(table: 'doctors'|'managers', fields: string[], req: Request, res: Response) {
  const adv = (req.session as any).advertiser;
  const id = parseInt(req.params.id);
  const body = pick(req.body, fields);
  const password = req.body.password;
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(body)) { sets.push(`${k}=?`); vals.push(v); }
  if (password) { sets.push('password_hash=?'); vals.push(await bcrypt.hash(String(password), 12)); }
  if (!sets.length) return res.status(400).json({ error: '변경할 항목이 없습니다.' });
  vals.push(id, adv.id);
  try {
    const [result]: any = await pool.execute(
      `UPDATE ${table} SET ${sets.join(', ')} WHERE id=? AND advertiser_id=? AND is_deleted=0`,
      vals
    );
    if (!result.affectedRows) return res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '이미 등록된 이메일입니다.' });
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
}

async function deleteStaff(table: 'doctors'|'managers', req: Request, res: Response) {
  const adv = (req.session as any).advertiser;
  const id = parseInt(req.params.id);
  const actor = getActor(req);
  const [result]: any = await pool.execute(
    `UPDATE ${table} SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [actor, id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
  res.json({ ok: true });
}

async function listAssignedPatients(role: 'doctor'|'manager', req: Request, res: Response) {
  const adv = (req.session as any).advertiser;
  const primaryCol = role === 'doctor' ? 'cv.doctor_id' : 'cv.manager_id';
  const { staff_id, campaign, customer_name, from_date, to_date, page = 1, size = 10 } = req.query;

  let where = `WHERE c.advertiser_id = ? AND ${primaryCol} IS NOT NULL`;
  const params: any[] = [adv.id];
  if (staff_id)      { where += ` AND ${primaryCol} = ?`; params.push(staff_id); }
  if (campaign)      { where += ' AND (c.campaign_name LIKE ? OR c.id LIKE ?)'; params.push(`%${campaign}%`, `%${campaign}%`); }
  if (customer_name) { where += ' AND cv.name LIKE ?'; params.push(`%${customer_name}%`); }
  if (from_date)     { where += ' AND DATE(cv.visited_at) >= ?'; params.push(from_date); }
  if (to_date)       { where += ' AND DATE(cv.visited_at) <= ?'; params.push(to_date); }

  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const joinPrimary = role === 'doctor' ? 'INNER JOIN doctors  pri ON pri.id = cv.doctor_id'
                                        : 'INNER JOIN managers pri ON pri.id = cv.manager_id';
  const joinOther   = role === 'doctor' ? 'LEFT  JOIN managers oth ON oth.id = cv.manager_id'
                                        : 'LEFT  JOIN doctors  oth ON oth.id = cv.doctor_id';

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       ${joinPrimary}
       ${where}`,
    params
  );
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT cv.id, cv.visited_at, cv.visit_type,
            cv.name AS patient_name, cv.user_id AS patient_user_id,
            cv.email AS patient_email, cv.mobile AS patient_mobile, cv.nationality,
            cv.treated_at, cv.treatment_amount, cv.treatment_discount_rate, cv.payment_amount, cv.payment_method,
            c.id AS campaign_id, c.campaign_name, c.discount_rate AS campaign_discount_rate,
            pri.id AS staff_id, pri.name AS staff_name, pri.email AS staff_email,
            oth.id AS other_id, oth.name AS other_name, oth.email AS other_email
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       ${joinPrimary}
       ${joinOther}
       ${where}
       ORDER BY cv.visited_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
}

// visit_type 토글
router.put('/visits/:id/type', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const t   = req.body.visit_type;
  if (t !== 'consulted' && t !== 'treated') return res.status(400).json({ error: 'visit_type 값이 잘못되었습니다.' });
  const treatedAt = String(req.body.treated_at || '').trim().replace('T', ' ');
  const method = String(req.body.payment_method || '').trim();
  let treatmentAmount = 0;
  let discountRate = 0;
  let paymentAmount = 0;
  if (t === 'treated') {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(treatedAt)) {
      return res.status(400).json({ error: '시술일시를 YYYY-MM-DD HH:MM 형식으로 입력하세요.' });
    }
    try {
      treatmentAmount = normalizeMoney(req.body.treatment_amount ?? req.body.payment_amount, '금액');
      discountRate = normalizeDiscountRate(req.body.treatment_discount_rate);
      paymentAmount = calcPaymentAmount(treatmentAmount, discountRate);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    if (!method) return res.status(400).json({ error: '결제수단을 입력하세요.' });
  }
  const [result]: any = await pool.execute(
    `UPDATE customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       SET cv.visit_type = ?,
           cv.treated_at = ?,
           cv.treatment_amount = ?,
           cv.treatment_discount_rate = ?,
           cv.payment_amount = ?,
           cv.payment_method = ?
       WHERE cv.id = ? AND c.advertiser_id = ?`,
    [
      t,
      t === 'treated' ? (treatedAt.length === 16 ? `${treatedAt}:00` : treatedAt) : null,
      t === 'treated' ? treatmentAmount : null,
      t === 'treated' ? discountRate : null,
      t === 'treated' ? paymentAmount : null,
      t === 'treated' ? method.slice(0, 100) : null,
      id,
      adv.id,
    ]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// 스탭 현황 통계 (의사/담당자 활성·비활성)
router.get('/stats', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser.id;
  const countOf = async (table: 'doctors' | 'managers') => {
    const [r] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active
         FROM ${table} WHERE advertiser_id = ? AND is_deleted = 0`, [adv]);
    const total = Number(r[0].total) || 0;
    const active = Number(r[0].active) || 0;
    return { total, active, inactive: total - active };
  };
  res.json({ ok: true, doctors: await countOf('doctors'), managers: await countOf('managers') });
});

// 의사 CRUD
router.get   ('/doctors',     requireAdvertiser, (req, res) => listStaff   ('doctors',  req, res));
router.post  ('/doctors',     requireAdvertiser, (req, res) => createStaff ('doctors',  DOCTOR_FIELDS, req, res));
router.put   ('/doctors/:id', requireAdvertiser, (req, res) => updateStaff ('doctors',  DOCTOR_FIELDS, req, res));
router.delete('/doctors/:id', requireAdvertiser, (req, res) => deleteStaff ('doctors',  req, res));
router.get   ('/doctor-patients',  requireAdvertiser, (req, res) => listAssignedPatients('doctor',  req, res));

// 담당자 CRUD
router.get   ('/managers',     requireAdvertiser, (req, res) => listStaff   ('managers', req, res));
router.post  ('/managers',     requireAdvertiser, (req, res) => createStaff ('managers', MANAGER_FIELDS, req, res));
router.put   ('/managers/:id', requireAdvertiser, (req, res) => updateStaff ('managers', MANAGER_FIELDS, req, res));
router.delete('/managers/:id', requireAdvertiser, (req, res) => deleteStaff ('managers', req, res));
router.get   ('/manager-patients', requireAdvertiser, (req, res) => listAssignedPatients('manager', req, res));

export default router;
