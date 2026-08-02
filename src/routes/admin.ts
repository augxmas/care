import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import pool from '../config/database';
import { requireSupervisor } from '../middleware/auth';
import { uploadBizCert } from '../middleware/upload';
import { sendEmail, sendRawEmail, getSystemVars } from '../services/email.service';
import { adTypeLabel, backupCampaignFiles, buildQuotationVars } from '../services/campaign.service';

const router = Router();

const HOSPITAL_FIELDS = [
  'company_name', 'company_name_en', 'hospital_id', 'ceo_name', 'business_no', 'biz_cert', 'representative_phone',
  'address1', 'address2', 'postal_code', 'medical_subjects', 'fax', 'homepage',
  'contact_name', 'contact_mobile', 'contact_email', 'serial_no',
];
const AGENCY_FIELDS = [
  'company_name', 'company_name_en', 'ceo_name', 'business_no', 'biz_cert', 'contact_phone',
  'address1', 'address2', 'postal_code', 'contact_name', 'contact_mobile',
  'contact_email', 'bank_name', 'bank_account',
];

function emailHash(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function escapeHtml(value: any): string {
  return String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char
  ));
}

function onlyDigits(value: any): string {
  return String(value || '').replace(/\D/g, '');
}

function formatBusinessNo(value: any): string {
  const digits = onlyDigits(value);
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : '';
}

function formatTelephone(value: any): string {
  const digits = onlyDigits(value);
  if (digits.startsWith('02')) {
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 11) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return '';
}

function formatMobile(value: any): string {
  const digits = onlyDigits(value);
  return /^010\d{8}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : '';
}

function hospitalSerialPrefix(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}`;
}

async function nextHospitalSerial(): Promise<string> {
  const prefix = hospitalSerialPrefix();
  const [rows] = await pool.execute<any[]>(
    'SELECT serial_no FROM hospitals WHERE serial_no LIKE ? ORDER BY serial_no DESC LIMIT 1',
    [`${prefix}_%`],
  );
  const last = rows.length ? Number(String(rows[0].serial_no).split('_')[1]) || 0 : 0;
  return `${prefix}_${String(last + 1).padStart(4, '0')}`;
}

async function ensureHospitalSerials(): Promise<void> {
  const [missing] = await pool.execute<any[]>(
    `SELECT id, created_at FROM hospitals
      WHERE serial_no IS NULL OR serial_no = ''
      ORDER BY created_at, id`,
  );
  const counters = new Map<string, number>();
  for (const hospital of missing) {
    const prefix = String(hospital.created_at || '').slice(0, 10).replace(/-/g, '') || hospitalSerialPrefix();
    if (!counters.has(prefix)) {
      const [rows] = await pool.execute<any[]>(
        'SELECT serial_no FROM hospitals WHERE serial_no LIKE ? ORDER BY serial_no DESC LIMIT 1',
        [`${prefix}_%`],
      );
      counters.set(prefix, rows.length ? Number(String(rows[0].serial_no).split('_')[1]) || 0 : 0);
    }
    const next = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, next);
    await pool.execute(
      'UPDATE hospitals SET serial_no=? WHERE id=? AND (serial_no IS NULL OR serial_no=?)',
      [`${prefix}_${String(next).padStart(4, '0')}`, hospital.id, ''],
    );
  }
}

function getClientIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || String(req.socket.remoteAddress || '')).replace(/^::ffff:/, '');
}

// ── Supervisor 로그인 ──────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const expectedUser = process.env.SUPERVISOR_USERNAME || 'supervisor';
  const expectedPass = process.env.SUPERVISOR_PASSWORD || 'sup2rv!sor';

  if (username !== expectedUser) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
  if (password !== expectedPass) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  const ip = getClientIp(req);
  const [previousRows] = await pool.execute<any[]>(
    `SELECT login_ip,logout_at
       FROM login_histories
      WHERE user_type='supervisor' AND user_id=? AND logout_at IS NOT NULL
      ORDER BY logout_at DESC,id DESC
      LIMIT 1`,
    [username],
  );
  const prevIp = previousRows[0]?.login_ip || null;
  const prevLogoutAt = previousRows[0]?.logout_at || null;

  await pool.execute(
    `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('supervisor', ?, ?, ?)`,
    [username, ip, req.sessionID]
  );

  (req.session as any).supervisor       = { username };
  (req.session as any).lastActivity     = Date.now();

  req.session.save((err) => {
    if (err) console.error('[Supervisor Login] Session save error:', err);
    res.json({ ok: true, prevIp, prevLogoutAt, message: '환영합니다. 많은 이용을 바랍니다.' });
  });
});

// ── Supervisor 로그아웃 ────────────────────────────────────
router.post('/logout', async (req: Request, res: Response) => {
  await pool.execute(
    'UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL',
    [req.sessionID]
  );
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ── Supervisor 세션 확인 ───────────────────────────────────
router.get('/me', (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  if (!sv) return res.status(401).json({ error: 'not_logged_in' });
  res.json({ ok: true, user: sv });
});

// ── 현황 통계 ─────────────────────────────────────────────
router.get('/stats', requireSupervisor, async (_req: Request, res: Response) => {
  // 1. 상태별 캠페인 개수 + 전체
  const [statusRows] = await pool.execute<any[]>(
    `SELECT status, COUNT(*) AS cnt FROM campaigns GROUP BY status`
  );
  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) { statusMap[r.status] = Number(r.cnt); total += Number(r.cnt); }

  // 2. 전체 광고비 vs 실제 입금된 광고비
  //    전체: 취소 제외 total_fee 합산
  //    입금: 입금확인·광고중·광고종료 total_fee 합산
  const [feeRows] = await pool.execute<any[]>(
    `SELECT
       SUM(CASE WHEN status <> '취소' THEN total_fee ELSE 0 END) AS total_fee,
       SUM(CASE WHEN status IN ('입금확인','광고중','광고종료') THEN total_fee ELSE 0 END) AS paid_fee
     FROM campaigns`
  );
  const totalFee = Number(feeRows[0].total_fee) || 0;
  const paidFee  = Number(feeRows[0].paid_fee)  || 0;

  // 3-a. 매출 상위 5 광고주 (입금확인·광고중·광고종료 기준, 해당 캠페인 건수도 동일 조건)
  const [topRevRows] = await pool.execute<any[]>(
    `SELECT a.company_name,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN c.total_fee ELSE 0 END) AS revenue,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN 1 ELSE 0 END) AS campaign_count
     FROM advertisers a
     INNER JOIN campaigns c ON c.advertiser_id = a.id
     GROUP BY a.id, a.company_name
     HAVING revenue > 0
     ORDER BY revenue DESC
     LIMIT 5`
  );

  // 3-b. 캠페인 등록 상위 5 광고주 (취소 제외한 전체 등록 건수 기준)
  const [topCntRows] = await pool.execute<any[]>(
    `SELECT a.company_name,
            COUNT(c.id) AS campaign_count,
            SUM(CASE WHEN c.status IN ('입금확인','광고중','광고종료') THEN c.total_fee ELSE 0 END) AS revenue
     FROM advertisers a
     INNER JOIN campaigns c ON c.advertiser_id = a.id
     WHERE c.status <> '취소'
     GROUP BY a.id, a.company_name
     HAVING campaign_count > 0
     ORDER BY campaign_count DESC
     LIMIT 5`
  );

  res.json({
    ok: true,
    statusMap, total,
    totalFee, paidFee,
    topRevenue: topRevRows.map(r => ({ company_name: r.company_name, revenue: Number(r.revenue), campaign_count: Number(r.campaign_count) })),
    topCount:   topCntRows.map(r => ({ company_name: r.company_name, campaign_count: Number(r.campaign_count), revenue: Number(r.revenue) })),
  });
});

// ── 캠페인 목록 (전체) ────────────────────────────────────
router.get('/campaigns', requireSupervisor, async (req: Request, res: Response) => {
  const {
    advertiser, campaign_name, status,
    reg_from, reg_to, from_date, to_date,
    page = 1, size = 10,
  } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (advertiser)     { where += ' AND a.company_name LIKE ?';            params.push(`%${advertiser}%`); }
  if (campaign_name)  { where += ' AND c.campaign_name LIKE ?';           params.push(`%${campaign_name}%`); }
  if (status)         { where += ' AND c.status = ?';                     params.push(status); }
  if (reg_from)       { where += ' AND DATE(c.created_at) >= ?';          params.push(reg_from); }
  if (reg_to)         { where += ' AND DATE(c.created_at) <= ?';          params.push(reg_to); }
  if (from_date)      { where += ' AND c.from_date >= ?';                 params.push(from_date); }
  if (to_date)        { where += ' AND c.to_date <= ?';                   params.push(to_date); }

  const pageNum  = Math.max(1, parseInt(String(page)));
  const pageSize = parseInt(String(size));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}`,
    params
  );
  const total = countRows[0].total;

  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name,
            a.status AS advertiser_status,
            a.biz_cert_path, a.biz_cert_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            CASE WHEN c.quotation_read_at IS NOT NULL THEN 1 ELSE 0 END AS quotation_read
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({ ok: true, data: rows, total, page: pageNum, size: pageSize });
});

// ── 캠페인 상세 ───────────────────────────────────────────
router.get('/campaigns/:id', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name, a.business_no,
            fn_decrypt(a.ceo_name) AS ceo_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            fn_decrypt(a.contact_mobile) AS contact_mobile,
            a.address1, a.address2, a.postal_code,
            a.biz_cert_path, a.biz_cert_name,
            a.status AS advertiser_status
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

// ── 입금 확인 ─────────────────────────────────────────────
router.put('/campaigns/:id/payment', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign  = rows[0];

  if (campaign.status !== '입금전') {
    return res.status(400).json({ error: '입금전 상태의 캠페인만 입금확인 처리할 수 있습니다.' });
  }

  const now      = new Date();
  const fromDate = new Date(campaign.from_date);
  const newStatus = now >= fromDate ? '광고중' : '입금확인';

  if (newStatus === '광고중') {
    await pool.execute(
      'UPDATE campaigns SET status = ?, payment_confirmed_at = NOW(), payment_confirmed_by = ?, approved_at = NOW(), approved_by = ? WHERE id = ?',
      [newStatus, sv.username, sv.username, campaign.id]
    );
  } else {
    await pool.execute(
      'UPDATE campaigns SET status = ?, payment_confirmed_at = NOW(), payment_confirmed_by = ? WHERE id = ?',
      [newStatus, sv.username, campaign.id]
    );
  }

  const fmtDate = (d: any) =>
    d instanceof Date ? d.toISOString().split('T')[0] : String(d || '').split('T')[0];

  const vars = {
    contact_name:  campaign.contact_name,
    company_name:  campaign.company_name,
    campaign_name: campaign.campaign_name,
    campaign_id:   campaign.id,
    from_date:     fmtDate(campaign.from_date),
    to_date:       fmtDate(campaign.to_date),
  };

  try { await sendEmail({ templateKey: 'payment_confirmed_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id }); } catch {}

  if (newStatus === '광고중') {
    try { await sendEmail({ templateKey: 'campaign_started_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id }); } catch {}
  }

  res.json({ ok: true, newStatus });
});

// ── 캠페인 승인 (입금확인 → 광고중) ──────────────────────
router.put('/campaigns/:id/approve', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (campaign.status !== '입금확인') {
    return res.status(400).json({ error: '입금확인 상태의 캠페인만 승인 처리할 수 있습니다.' });
  }

  await pool.execute(
    'UPDATE campaigns SET status = ?, approved_at = NOW(), approved_by = ? WHERE id = ?',
    ['광고중', sv.username, campaign.id]
  );

  const fmtDate = (d: any) =>
    d instanceof Date ? d.toISOString().split('T')[0] : String(d || '').split('T')[0];

  const vars = {
    contact_name:  campaign.contact_name,
    company_name:  campaign.company_name,
    campaign_name: campaign.campaign_name,
    campaign_id:   campaign.id,
    from_date:     fmtDate(campaign.from_date),
    to_date:       fmtDate(campaign.to_date),
  };
  try { await sendEmail({ templateKey: 'campaign_started_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id }); } catch {}

  res.json({ ok: true, newStatus: '광고중' });
});

// ── 캠페인 취소 (supervisor) ──────────────────────────────
router.put('/campaigns/:id/cancel', requireSupervisor, async (req: Request, res: Response) => {
  const sv = (req.session as any).supervisor;
  const [rows] = await pool.execute<any[]>(
    `SELECT c.*, a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email
     FROM campaigns c JOIN advertisers a ON c.advertiser_id = a.id
     WHERE c.id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (['취소', '광고종료'].includes(campaign.status)) {
    return res.status(400).json({ error: '이미 취소되었거나 종료된 캠페인입니다.' });
  }

  await pool.execute(
    'UPDATE campaigns SET status = ?, cancelled_at = NOW(), cancelled_by = ? WHERE id = ?',
    ['취소', sv.username, campaign.id]
  );

  const vars = {
    contact_name:     campaign.contact_name,
    campaign_id:      campaign.id,
    campaign_name:    campaign.campaign_name,
    supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
  };
  try { await sendEmail({ templateKey: 'campaign_cancelled_advertiser', to: campaign.contact_email, vars, campaignId: campaign.id }); } catch {}

  res.json({ ok: true });
});

// ── 광고주 승인/취소/종료 ─────────────────────────────────
router.get('/hospital-form-config/public', async (_req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT field_key, enabled, required, searchable, sort_order FROM hospital_form_fields WHERE enabled = 1 ORDER BY sort_order',
  );
  res.json({ ok: true, data: rows });
});

router.get('/hospital-form-config', requireSupervisor, async (_req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT field_key, enabled, required, searchable, sort_order FROM hospital_form_fields ORDER BY sort_order',
  );
  res.json({ ok: true, data: rows });
});

router.put('/hospital-form-config', requireSupervisor, async (req: Request, res: Response) => {
  const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
  const byKey = new Map(fields.map((field: any) => [String(field.field_key), field]));
  const systemRequired = new Set(['company_name', 'hospital_id', 'business_no', 'contact_email']);
  for (let index = 0; index < HOSPITAL_FIELDS.length; index += 1) {
    const key = HOSPITAL_FIELDS[index];
    const field: any = byKey.get(key) || {};
    const enabled = systemRequired.has(key) || Boolean(field.enabled);
    const required = key !== 'serial_no' && (systemRequired.has(key) || (enabled && Boolean(field.required)));
    const searchable = Boolean(field.searchable);
    await pool.execute(
      `UPDATE hospital_form_fields SET enabled=?, required=?, searchable=?, sort_order=?, updated_at=NOW() WHERE field_key=?`,
      [enabled ? 1 : 0, required ? 1 : 0, searchable ? 1 : 0, index + 1, key],
    );
  }
  res.json({ ok: true });
});

router.get('/agency-form-config/public', async (_req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT field_key, enabled, required, searchable, sort_order FROM agency_form_fields WHERE enabled=1 ORDER BY sort_order',
  );
  res.json({ ok: true, data: rows });
});

router.get('/agency-form-config', requireSupervisor, async (_req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT field_key, enabled, required, searchable, sort_order FROM agency_form_fields ORDER BY sort_order',
  );
  res.json({ ok: true, data: rows });
});

router.put('/agency-form-config', requireSupervisor, async (req: Request, res: Response) => {
  const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
  const byKey = new Map(fields.map((field: any) => [String(field.field_key), field]));
  const systemRequired = new Set(['company_name', 'business_no', 'contact_email']);
  for (let index = 0; index < AGENCY_FIELDS.length; index += 1) {
    const key = AGENCY_FIELDS[index];
    const field: any = byKey.get(key) || {};
    const enabled = systemRequired.has(key) || Boolean(field.enabled);
    const required = systemRequired.has(key) || (enabled && Boolean(field.required));
    await pool.execute(
      `UPDATE agency_form_fields SET enabled=?,required=?,searchable=?,sort_order=?,updated_at=NOW()
       WHERE field_key=?`,
      [enabled ? 1 : 0, required ? 1 : 0, field.searchable ? 1 : 0, index + 1, key],
    );
  }
  res.json({ ok: true });
});

router.post('/agencies/register', uploadBizCert.single('biz_cert'), async (req: Request, res: Response) => {
  const [config] = await pool.execute<any[]>('SELECT field_key,required FROM agency_form_fields WHERE enabled=1');
  for (const field of config) {
    if (!field.required) continue;
    const missing = field.field_key === 'biz_cert' ? !req.file : !String(req.body[field.field_key] || '').trim();
    if (missing) return res.status(400).json({ error: `${field.field_key} 항목은 필수입니다.` });
  }
  const businessNo = formatBusinessNo(req.body.business_no);
  const email = String(req.body.contact_email || '').trim().toLowerCase();
  if (!businessNo || !email) return res.status(400).json({ error: '사업자등록번호와 이메일을 확인하세요.' });
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  try {
    const [result]: any = await pool.execute(
      `INSERT INTO advertisers
       (company_name,company_name_en,business_no,ceo_name,address1,address2,postal_code,contact_name,
        contact_mobile,contact_phone,contact_email,email_hash,password_hash,biz_cert_path,
        biz_cert_name,status,bank_name,bank_account,password_reset_required)
       VALUES (?, ?, ?, fn_encrypt(?), ?, ?, ?, fn_encrypt(?), fn_encrypt(?), fn_encrypt(?),
               fn_encrypt(?), ?, ?, ?, ?, 'pending', ?, ?, 1)`,
      [
        req.body.company_name, req.body.company_name_en || '', businessNo, req.body.ceo_name || '', req.body.address1 || '',
        req.body.address2 || '', req.body.postal_code || '', req.body.contact_name || '',
        req.body.contact_mobile || '', req.body.contact_phone || '', email, emailHash(email),
        passwordHash, req.file?.path || null, req.file?.originalname || null,
        req.body.bank_name || '', req.body.bank_account || '',
      ],
    );
    res.json({ ok: true, id: result.insertId });
  } catch (error: any) {
    if (String(error.message).toLowerCase().includes('unique')) {
      return res.status(409).json({ error: '이미 등록된 사업자등록번호 또는 이메일입니다.' });
    }
    throw error;
  }
});

router.post('/hospitals/register', uploadBizCert.single('biz_cert'), async (req: Request, res: Response) => {
  const [config] = await pool.execute<any[]>('SELECT field_key, required FROM hospital_form_fields WHERE enabled=1');
  for (const field of config) {
    if (!field.required) continue;
    const missing = field.field_key === 'biz_cert'
      ? !req.file
      : !String(req.body[field.field_key] || '').trim();
    if (missing) return res.status(400).json({ error: `${field.field_key} 항목은 필수입니다.` });
  }
  const email = String(req.body.contact_email || '').trim().toLowerCase();
  const hospitalId = String(req.body.hospital_id || '').trim().toLowerCase();
  const businessNo = formatBusinessNo(req.body.business_no);
  const representativePhone = formatTelephone(req.body.representative_phone);
  const fax = req.body.fax ? formatTelephone(req.body.fax) : '';
  const mobileDigits = onlyDigits(req.body.contact_mobile);
  const contactMobile = mobileDigits.length === 11 && mobileDigits.startsWith('010')
    ? `010-${mobileDigits.slice(3, 7)}-${mobileDigits.slice(7)}`
    : '';
  if (!/^[a-z0-9_-]+$/.test(hospitalId)) {
    return res.status(400).json({ error: '병원ID는 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 입력하세요.' });
  }
  if (!businessNo) return res.status(400).json({ error: '사업자등록번호는 10자리 숫자로 입력하세요.' });
  if (req.body.representative_phone && !representativePhone) {
    return res.status(400).json({ error: '대표전화 형식이 올바르지 않습니다.' });
  }
  if (req.body.fax && !fax) return res.status(400).json({ error: '팩스번호 형식이 올바르지 않습니다.' });
  if (req.body.contact_mobile && !contactMobile) {
    return res.status(400).json({ error: '담당자 모바일폰은 010-####-#### 형식으로 입력하세요.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '담당자 이메일 형식이 올바르지 않습니다.' });
  }
  if (req.body.homepage) {
    try {
      const url = new URL(String(req.body.homepage));
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error();
    } catch {
      return res.status(400).json({ error: '홈페이지 주소 형식이 올바르지 않습니다.' });
    }
  }
  const [duplicate] = await pool.execute<any[]>(
    'SELECT id FROM hospitals WHERE business_no=? OR hospital_id=?', [businessNo, hospitalId],
  );
  if (duplicate.length) return res.status(409).json({ error: '이미 등록된 사업자등록번호 또는 병원ID입니다.' });

  const serialNo = await nextHospitalSerial();
  const [result]: any = await pool.execute(
    `INSERT INTO hospitals
      (company_name,company_name_en,hospital_id,business_no,ceo_name,address1,address2,postal_code,
       contact_name,contact_mobile,contact_email,representative_phone,
       medical_subjects,fax,homepage,serial_no,biz_cert_path,biz_cert_name,status)
     VALUES (?,?,?,?,fn_encrypt(?),?,?,?,fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),
             ?,?,?,?,?,?,?,'pending')`,
    [
      req.body.company_name || '', req.body.company_name_en || '', hospitalId, businessNo, req.body.ceo_name || '',
      req.body.address1 || '', req.body.address2 || '', req.body.postal_code || '',
      req.body.contact_name || '', contactMobile, email,
      representativePhone, req.body.medical_subjects || '',
      fax, req.body.homepage || '', serialNo,
      req.file?.path || null, req.file?.originalname || null,
    ],
  );
  res.status(201).json({ ok: true, id: result.insertId, serial_no: serialNo, status: 'pending' });
});

router.get('/hospitals', requireSupervisor, async (req: Request, res: Response) => {
  await ensureHospitalSerials();
  const { keyword = '', status = '', page = 1, size = 20 } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (keyword) {
    where += ' AND (company_name LIKE ? OR hospital_id LIKE ? OR business_no LIKE ? OR serial_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { where += ' AND status=?'; params.push(status); }
  const [searchConfig] = await pool.execute<any[]>(
    'SELECT field_key FROM hospital_form_fields WHERE searchable=1',
  );
  const searchable = new Set(searchConfig.map(row => String(row.field_key)));
  const plainColumns: Record<string, string> = {
    company_name: 'company_name', company_name_en: 'company_name_en', hospital_id: 'hospital_id', business_no: 'business_no', representative_phone: 'representative_phone',
    address1: 'address1', address2: 'address2', postal_code: 'postal_code',
    medical_subjects: 'medical_subjects', fax: 'fax', homepage: 'homepage', serial_no: 'serial_no',
  };
  const encryptedColumns: Record<string, string> = {
    ceo_name: 'ceo_name', contact_name: 'contact_name',
    contact_mobile: 'contact_mobile', contact_email: 'contact_email',
  };
  const encryptedFilters: Array<{ key: string; value: string }> = [];
  for (const key of searchable) {
    const value = String(req.query[key] || '').trim();
    if (!value) continue;
    if (plainColumns[key]) {
      where += ` AND ${plainColumns[key]} LIKE ?`;
      params.push(`%${value}%`);
    } else if (encryptedColumns[key]) {
      encryptedFilters.push({ key, value: value.toLocaleLowerCase('ko-KR') });
    } else if (key === 'biz_cert') {
      where += value === 'yes' ? ' AND biz_cert_path IS NOT NULL' : ' AND biz_cert_path IS NULL';
    }
  }
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(size) || 20));
  const offset = (pageNumber - 1) * pageSize;
  const [rows] = await pool.execute<any[]>(
    `SELECT id,company_name,company_name_en,hospital_id,business_no,serial_no,status,created_at,approved_at,
            (SELECT COUNT(*) FROM hospital_agency_requests har
              WHERE har.hospital_id=hospitals.id AND har.status='approved') AS agency_count,
            biz_cert_path,biz_cert_name,representative_phone,address1,address2,postal_code,
            medical_subjects,fax,homepage,
            fn_decrypt(ceo_name) AS ceo_name,fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_mobile) AS contact_mobile,fn_decrypt(contact_email) AS contact_email
       FROM hospitals ${where} ORDER BY created_at DESC`,
    params,
  );
  const filtered = rows.filter(row => encryptedFilters.every(filter =>
    String(row[filter.key] || '').toLocaleLowerCase('ko-KR').includes(filter.value),
  ));
  res.json({
    ok: true, data: filtered.slice(offset, offset + pageSize),
    total: filtered.length, page: pageNumber, size: pageSize,
  });
});

router.get('/hospitals/:id/agencies', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT har.id,har.status,har.requested_at,har.responded_at,
            a.id AS advertiser_id,a.company_name,a.business_no,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            fn_decrypt(a.contact_mobile) AS contact_mobile
       FROM hospital_agency_requests har
       JOIN advertisers a ON a.id=har.advertiser_id
      WHERE har.hospital_id=?
      ORDER BY CASE har.status WHEN 'approved' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
               har.requested_at DESC`,
    [req.params.id],
  );
  res.json({ ok: true, data: rows });
});

router.get('/hospitals/:id/agency-candidates', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT a.id,a.company_name,a.business_no,a.status,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            COALESCE(har.status,'') AS request_status
       FROM advertisers a
       LEFT JOIN hospital_agency_requests har
         ON har.advertiser_id=a.id AND har.hospital_id=?
      WHERE a.status='approved'
      ORDER BY a.company_name`,
    [req.params.id],
  );
  res.json({ ok: true, data: rows });
});

router.post('/hospitals/:id/agency-requests', requireSupervisor, async (req: Request, res: Response) => {
  const advertiserId = Number(req.body.advertiser_id);
  if (!advertiserId) return res.status(400).json({ error: '대행사를 선택하세요.' });
  const [hospitalRows] = await pool.execute<any[]>(
    'SELECT id,company_name,business_no,serial_no FROM hospitals WHERE id=?',
    [req.params.id],
  );
  const [agencyRows] = await pool.execute<any[]>(
    `SELECT id,company_name,fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id=?`,
    [advertiserId],
  );
  if (!hospitalRows.length || !agencyRows.length) {
    return res.status(404).json({ error: '병원 또는 대행사를 찾을 수 없습니다.' });
  }
  const hospital = hospitalRows[0];
  const agency = agencyRows[0];
  if (!agency.contact_email) return res.status(400).json({ error: '선택한 대행사에 담당자 이메일이 없습니다.' });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const requestedBy = (req.session as any).supervisor?.username || 'supervisor';
  const [existing] = await pool.execute<any[]>(
    'SELECT id,status FROM hospital_agency_requests WHERE hospital_id=? AND advertiser_id=?',
    [hospital.id, agency.id],
  );
  if (existing.length) {
    if (existing[0].status === 'approved') {
      return res.status(409).json({ error: '이미 관계가 승인된 대행사입니다.' });
    }
    await pool.execute(
      `UPDATE hospital_agency_requests SET status='pending',token_hash=?,requested_by=?,
              requested_at=NOW(),responded_at=NULL,updated_at=NOW() WHERE id=?`,
      [tokenHash, requestedBy, existing[0].id],
    );
  } else {
    await pool.execute(
      `INSERT INTO hospital_agency_requests
       (hospital_id,advertiser_id,status,token_hash,requested_by)
       VALUES (?,?,'pending',?,?)`,
      [hospital.id, agency.id, tokenHash, requestedBy],
    );
  }
  const baseUrl = String(process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
  const responseUrl = `${baseUrl}/agency-hospital-request/${token}`;
  const subject = `[전문 외국환자관리 CRM] ${hospital.company_name} 병원 대행 요청`;
  const html = `<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:600px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:10px"><h2 style="text-align:center">병원 대행 승인 요청</h2><p>${escapeHtml(agency.contact_name || '담당자')}님, 안녕하세요.</p><p><b>${escapeHtml(hospital.company_name)}</b> 병원에서 <b>${escapeHtml(agency.company_name)}</b>에 대행사 관계 승인을 요청했습니다.</p><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><th style="padding:10px;background:#f3f4f6;text-align:left">병원명</th><td style="padding:10px;border-bottom:1px solid #eee">${escapeHtml(hospital.company_name)}</td></tr><tr><th style="padding:10px;background:#f3f4f6;text-align:left">사업자등록번호</th><td style="padding:10px;border-bottom:1px solid #eee">${escapeHtml(hospital.business_no)}</td></tr><tr><th style="padding:10px;background:#f3f4f6;text-align:left">일련번호</th><td style="padding:10px;border-bottom:1px solid #eee">${escapeHtml(hospital.serial_no)}</td></tr></table><div style="text-align:center;margin:28px 0"><a href="${responseUrl}" style="display:inline-block;padding:13px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:7px;font-weight:bold">승인 요청 확인</a></div><p style="font-size:12px;color:#6b7280">위 버튼을 눌러 승인 또는 반려해 주세요.</p></div>`;
  let emailSent = false;
  try {
    await sendRawEmail({ to: agency.contact_email, subject, html, sentBy: requestedBy });
    emailSent = true;
  } catch (error) {
    console.error('[Hospital Agency Request Email Error]', error);
  }
  res.json({ ok: true, emailSent, emailTarget: agency.contact_email });
});

router.get('/hospital-agency-request/:token', async (req: Request, res: Response) => {
  const tokenHash = crypto.createHash('sha256').update(String(req.params.token)).digest('hex');
  const [rows] = await pool.execute<any[]>(
    `SELECT har.status,har.requested_at,har.responded_at,
            h.company_name AS hospital_name,h.business_no,h.serial_no,
            a.company_name AS agency_name,fn_decrypt(a.contact_name) AS contact_name
       FROM hospital_agency_requests har
       JOIN hospitals h ON h.id=har.hospital_id
       JOIN advertisers a ON a.id=har.advertiser_id
      WHERE har.token_hash=?`,
    [tokenHash],
  );
  if (!rows.length) return res.status(404).json({ error: '유효하지 않은 승인 요청입니다.' });
  res.json({ ok: true, data: rows[0] });
});

router.post('/hospital-agency-request/:token/respond', async (req: Request, res: Response) => {
  const decision = String(req.body.decision || '');
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: '승인 또는 반려를 선택하세요.' });
  }
  const tokenHash = crypto.createHash('sha256').update(String(req.params.token)).digest('hex');
  const [rows] = await pool.execute<any[]>(
    'SELECT id,status FROM hospital_agency_requests WHERE token_hash=?',
    [tokenHash],
  );
  if (!rows.length) return res.status(404).json({ error: '유효하지 않은 승인 요청입니다.' });
  if (rows[0].status !== 'pending') {
    return res.status(409).json({ error: '이미 처리된 승인 요청입니다.' });
  }
  await pool.execute(
    'UPDATE hospital_agency_requests SET status=?,responded_at=NOW(),updated_at=NOW() WHERE id=?',
    [decision, rows[0].id],
  );
  res.json({ ok: true, status: decision });
});

router.get('/hospitals/:id', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id,company_name,company_name_en,hospital_id,business_no,address1,address2,postal_code,representative_phone,
            medical_subjects,fax,homepage,serial_no,biz_cert_path,biz_cert_name,status,status_reason,
            created_at,approved_at,fn_decrypt(ceo_name) AS ceo_name,
            fn_decrypt(contact_name) AS contact_name,fn_decrypt(contact_mobile) AS contact_mobile,
            fn_decrypt(contact_email) AS contact_email
       FROM hospitals WHERE id=?`,
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: '병원을 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

router.put('/hospitals/:id', requireSupervisor, async (req: Request, res: Response) => {
  const body = req.body;
  const [existingRows] = await pool.execute<any[]>(
    `SELECT company_name,company_name_en,hospital_id,business_no,representative_phone,address1,address2,postal_code,
            medical_subjects,fax,homepage,fn_decrypt(ceo_name) AS ceo_name,
            fn_decrypt(contact_name) AS contact_name,fn_decrypt(contact_mobile) AS contact_mobile,
            fn_decrypt(contact_email) AS contact_email FROM hospitals WHERE id=?`,
    [req.params.id],
  );
  if (!existingRows.length) return res.status(404).json({ error: '병원을 찾을 수 없습니다.' });
  const existing = existingRows[0];
  const value = (key: string) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key];
  const hospitalId = String(value('hospital_id') || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(hospitalId)) {
    return res.status(400).json({ error: '병원ID는 영문 소문자, 숫자, 하이픈(-), 밑줄(_)만 입력하세요.' });
  }
  const [duplicateHospitalId] = await pool.execute<any[]>(
    'SELECT id FROM hospitals WHERE hospital_id=? AND id<>?',
    [hospitalId, req.params.id],
  );
  if (duplicateHospitalId.length) return res.status(409).json({ error: '이미 사용 중인 병원ID입니다.' });
  await pool.execute(
    `UPDATE hospitals SET company_name=?,company_name_en=?,hospital_id=?,business_no=?,ceo_name=fn_encrypt(?),
       representative_phone=?,address1=?,address2=?,postal_code=?,
       medical_subjects=?,fax=?,homepage=?,contact_name=fn_encrypt(?),contact_mobile=fn_encrypt(?),
       contact_email=fn_encrypt(?),updated_at=NOW() WHERE id=?`,
    [
      value('company_name'), value('company_name_en') || '', hospitalId, value('business_no'), value('ceo_name') || '', value('representative_phone') || '',
      value('address1') || '', value('address2') || '', value('postal_code') || '',
      value('medical_subjects') || '', value('fax') || '', value('homepage') || '', value('contact_name') || '',
      value('contact_mobile') || '', String(value('contact_email') || '').trim().toLowerCase(),
      req.params.id,
    ],
  );
  res.json({ ok: true });
});

router.put('/hospitals/:id/status', requireSupervisor, async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  if (status === 'rejected' && !String(reason || '').trim()) {
    return res.status(400).json({ error: '반려 사유를 입력하세요.' });
  }
  const [hospitalRows] = await pool.execute<any[]>(
    `SELECT company_name,fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email FROM hospitals WHERE id=?`,
    [req.params.id],
  );
  if (!hospitalRows.length) return res.status(404).json({ error: '병원을 찾을 수 없습니다.' });
  const hospital = hospitalRows[0];
  const [result]: any = await pool.execute(
    `UPDATE hospitals SET status=?,status_reason=?,updated_at=NOW(),
            approved_at=CASE WHEN ?='approved' THEN NOW() ELSE approved_at END
      WHERE id=?`,
    [status, reason || null, status, req.params.id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: '병원을 찾을 수 없습니다.' });
  let emailSent = false;
  if (['approved', 'rejected'].includes(status) && hospital.contact_email) {
    const approved = status === 'approved';
    const subject = `[전문 외국환자관리 CRM] ${hospital.company_name} 병원 ${approved ? '승인' : '반려'} 안내`;
    const reasonHtml = approved ? '' : `<div style="margin:20px 0;padding:16px;background:#fef2f2;border-left:4px solid #dc2626"><b>반려 사유</b><p style="margin:8px 0 0">${String(reason || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c))}</p></div>`;
    const html = `<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:600px;margin:auto;padding:28px;border:1px solid #e5e7eb;border-radius:10px"><h2 style="text-align:center">병원 등록 ${approved ? '승인' : '반려'} 안내</h2><p>${hospital.contact_name || '담당자'}님, 안녕하세요.</p><p><b>${hospital.company_name}</b> 병원의 등록 요청이 <b>${approved ? '승인' : '반려'}</b> 처리되었습니다.</p>${reasonHtml}<p style="margin-top:24px;color:#6b7280">본 메일은 전문 외국환자관리 CRM에서 자동 발송되었습니다.</p></div>`;
    try {
      await sendRawEmail({ to: hospital.contact_email, subject, html, sentBy: 'supervisor' });
      emailSent = true;
    } catch (error) {
      console.error('[Hospital Status Email Error]', error);
    }
  }
  res.json({ ok: true, emailSent, emailTarget: hospital.contact_email || null });
});

router.delete('/hospitals/:id', requireSupervisor, async (req: Request, res: Response) => {
  const [result]: any = await pool.execute('DELETE FROM hospitals WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: '병원을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

router.get('/hospitals/:id/biz-cert', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT biz_cert_path,biz_cert_name FROM hospitals WHERE id=?', [req.params.id],
  );
  if (!rows.length || !rows[0].biz_cert_path || !fs.existsSync(rows[0].biz_cert_path)) {
    return res.status(404).json({ error: '사업자등록증을 찾을 수 없습니다.' });
  }
  res.download(rows[0].biz_cert_path, rows[0].biz_cert_name || 'biz_cert');
});

router.put('/advertisers/:id/status', requireSupervisor, async (req: Request, res: Response) => {
  const { status, reason } = req.body;
  if (!['pending', 'approved', 'rejected', 'terminated'].includes(status)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  if ((status === 'rejected' || status === 'terminated') && !reason) {
    return res.status(400).json({ error: '사유를 입력하세요.' });
  }

  const [rows] = await pool.execute<any[]>(
    `SELECT id, company_name, fn_decrypt(contact_name) AS contact_name, fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id = ?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: '광고주를 찾을 수 없습니다.' });
  const advertiser = rows[0];

  await pool.execute(
    `UPDATE advertisers SET status=?, status_reason=?, updated_at=NOW(),
            approved_at=CASE WHEN ?='approved' THEN NOW() ELSE approved_at END
      WHERE id=?`,
    [status, reason || null, status, advertiser.id]
  );

  const sysVars = getSystemVars();
  const vars = {
    contact_name:     advertiser.contact_name,
    company_name:     advertiser.company_name,
    reason:           reason || '',
    supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
    login_url:        sysVars.login_url,
  };

  const templateMap: Record<string, string> = {
    approved:   'registration_approved',
    rejected:   'registration_rejected',
    terminated: 'registration_terminated',
  };

  if (templateMap[status]) {
    try { await sendEmail({ templateKey: templateMap[status], to: advertiser.contact_email, vars, advertiserId: advertiser.id }); } catch {}
  }

  res.json({ ok: true });
});

// ── 광고주 목록 ────────────────────────────────────────────
router.get('/advertisers', requireSupervisor, async (req: Request, res: Response) => {
  const { company_name, status, page = 1, size = 10 } = req.query;
  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (company_name) { where += ' AND company_name LIKE ?'; params.push(`%${company_name}%`); }
  if (status)       { where += ' AND status = ?';          params.push(status); }
  for (const key of ['company_name_en', 'business_no', 'address1', 'address2', 'postal_code', 'bank_name', 'bank_account']) {
    const value = String(req.query[key] || '').trim();
    if (value) { where += ` AND ${key} LIKE ?`; params.push(`%${value}%`); }
  }
  for (const key of ['ceo_name', 'contact_name', 'contact_mobile', 'contact_phone', 'contact_email']) {
    const value = String(req.query[key] || '').trim();
    if (value) { where += ` AND fn_decrypt(${key}) LIKE ?`; params.push(`%${value}%`); }
  }

  const pageNum  = Math.max(1, parseInt(String(page)));
  const pageSize = parseInt(String(size));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM advertisers ${where}`, params);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, company_name, company_name_en, business_no, status, biz_cert_path, biz_cert_name,
            bank_name, bank_account, created_at, approved_at,
            push_consent,email_consent,terms_consent,privacy_consent,password_reset_required,
            (SELECT COUNT(*) FROM hospital_agency_requests har
              WHERE har.advertiser_id=advertisers.id AND har.status='approved') AS hospital_count,
            fn_decrypt(ceo_name) AS ceo_name,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email,
            fn_decrypt(contact_mobile) AS contact_mobile
     FROM advertisers ${where}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({ ok: true, data: rows, total: countRows[0].total, page: pageNum, size: pageSize });
});

router.get('/agencies/:id/hospitals', requireSupervisor, async (req: Request, res: Response) => {
  const [agencies] = await pool.execute<any[]>('SELECT id FROM advertisers WHERE id=?', [req.params.id]);
  if (!agencies.length) return res.status(404).json({ error: '대행사를 찾을 수 없습니다.' });
  const [rows] = await pool.execute<any[]>(
    `SELECT h.id,h.company_name,h.business_no,h.serial_no,h.medical_subjects,
            h.representative_phone,h.status,har.responded_at AS linked_at
       FROM hospital_agency_requests har
       JOIN hospitals h ON h.id=har.hospital_id
      WHERE har.advertiser_id=? AND har.status='approved'
      ORDER BY h.company_name`,
    [req.params.id],
  );
  res.json({ ok: true, data: rows });
});

router.get('/agencies/:id', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id,company_name,company_name_en,business_no,address1,address2,postal_code,status,status_reason,
            biz_cert_path,biz_cert_name,bank_name,bank_account,created_at,approved_at,updated_at,
            push_consent,email_consent,terms_consent,privacy_consent,password_reset_required,
            fn_decrypt(ceo_name) AS ceo_name,fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_mobile) AS contact_mobile,fn_decrypt(contact_phone) AS contact_phone,
            fn_decrypt(contact_email) AS contact_email
       FROM advertisers WHERE id=?`,
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: '대행사를 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

router.put('/agencies/:id', requireSupervisor, async (req: Request, res: Response) => {
  const body = req.body;
  const normalizedEmail = String(body.contact_email || '').trim().toLowerCase();
  const contactPhone = formatTelephone(body.contact_phone);
  const contactMobile = formatMobile(body.contact_mobile);
  const bankAccount = onlyDigits(body.bank_account);
  if (body.contact_phone && !/^(02-\d{4}-\d{4}|\d{3}-\d{3}-\d{4}|\d{3}-\d{4}-\d{4})$/.test(contactPhone)) {
    return res.status(400).json({ error: '대표전화 형식을 확인하세요.' });
  }
  if (body.contact_mobile && !contactMobile) {
    return res.status(400).json({ error: '담당자 모바일폰은 010-####-#### 형식으로 입력하세요.' });
  }
  const newPassword = String(body.new_password || '');
  if (newPassword && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(newPassword)) {
    return res.status(400).json({ error: '비밀번호는 대문자, 소문자, 숫자, 특수문자를 포함한 8자 이상이어야 합니다.' });
  }
  const passwordSql = newPassword ? ',password_hash=?,password_reset_required=0' : '';
  const passwordParams = newPassword ? [await bcrypt.hash(newPassword, 12)] : [];
  const [result]: any = await pool.execute(
    `UPDATE advertisers SET company_name=?,company_name_en=?,business_no=?,ceo_name=fn_encrypt(?),
            address1=?,address2=?,postal_code=?,contact_name=fn_encrypt(?),
            contact_mobile=fn_encrypt(?),contact_phone=fn_encrypt(?),
            contact_email=fn_encrypt(?),email_hash=?,bank_name=?,bank_account=?,
            terms_consent=?,privacy_consent=?,push_consent=?,email_consent=?${passwordSql},updated_at=NOW()
      WHERE id=?`,
    [
      body.company_name, body.company_name_en || '', body.business_no, body.ceo_name || '',
      body.address1 || '', body.address2 || '', body.postal_code || '',
      body.contact_name || '', contactMobile, contactPhone,
      normalizedEmail, emailHash(normalizedEmail), body.bank_name || '',
      bankAccount, body.terms_consent ? 1 : 0, body.privacy_consent ? 1 : 0,
      body.push_consent ? 1 : 0, body.email_consent ? 1 : 0,
      ...passwordParams, req.params.id,
    ],
  );
  if (!result.affectedRows) return res.status(404).json({ error: '대행사를 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// ── 사업자등록증 다운로드 ──────────────────────────────────
router.get('/advertisers/:id/biz-cert', requireSupervisor, async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    'SELECT biz_cert_path, biz_cert_name FROM advertisers WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length || !rows[0].biz_cert_path) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }
  const filePath = rows[0].biz_cert_path;
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
  res.download(filePath, rows[0].biz_cert_name || 'biz_cert');
});

// ── Excel 다운로드 (전체 조회 결과) ───────────────────────
router.get('/campaigns/excel/download', requireSupervisor, async (req: Request, res: Response) => {
  const { advertiser, campaign_name, status, reg_from, reg_to, from_date, to_date } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  if (advertiser)    { where += ' AND a.company_name LIKE ?';   params.push(`%${advertiser}%`); }
  if (campaign_name) { where += ' AND c.campaign_name LIKE ?';  params.push(`%${campaign_name}%`); }
  if (status)        { where += ' AND c.status = ?';            params.push(status); }
  if (reg_from)      { where += ' AND DATE(c.created_at) >= ?'; params.push(reg_from); }
  if (reg_to)        { where += ' AND DATE(c.created_at) <= ?'; params.push(reg_to); }
  if (from_date)     { where += ' AND c.from_date >= ?';        params.push(from_date); }
  if (to_date)       { where += ' AND c.to_date <= ?';          params.push(to_date); }

  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            a.company_name,
            fn_decrypt(a.contact_name) AS contact_name,
            fn_decrypt(a.contact_email) AS contact_email,
            CASE WHEN c.quotation_read_at IS NOT NULL THEN '읽음' ELSE '미읽음' END AS quotation_read_label,
            a.status AS advertiser_status
     FROM campaigns c
     JOIN advertisers a ON c.advertiser_id = a.id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('캠페인 목록');
  ws.columns = [
    { header: '광고주',       key: 'company_name',  width: 25 },
    { header: '캠페인 ID',    key: 'id',            width: 14 },
    { header: '캠페인명',     key: 'campaign_name', width: 30 },
    { header: '이미지',       key: 'has_image',     width: 8  },
    { header: 'HTML',         key: 'has_html',      width: 8  },
    { header: 'YouTube',      key: 'has_youtube',   width: 10 },
    { header: '시작일',       key: 'from_date',     width: 12 },
    { header: '종료일',       key: 'to_date',       width: 12 },
    { header: '광고료(원)',   key: 'total_fee',     width: 14 },
    { header: '견적서수신',   key: 'quotation_read_label', width: 10 },
    { header: '광고주상태',   key: 'advertiser_status', width: 12 },
    { header: '캠페인상태',   key: 'status',        width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      company_name:  r.company_name,
      id:            r.id,
      campaign_name: r.campaign_name,
      has_image:     r.has_image   ? 'O' : '',
      has_html:      r.has_html    ? 'O' : '',
      has_youtube:   r.has_youtube ? 'O' : '',
      from_date:     r.from_date instanceof Date ? r.from_date.toISOString().slice(0,10) : (typeof r.from_date === 'string' ? r.from_date.split('T')[0] : r.from_date),
      to_date:       r.to_date   instanceof Date ? r.to_date.toISOString().slice(0,10)   : (typeof r.to_date   === 'string' ? r.to_date.split('T')[0]   : r.to_date),
      total_fee:     r.total_fee,
      quotation_read_label: r.quotation_read_label,
      advertiser_status: r.advertiser_status,
      status:        r.status,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="admin_campaigns.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

export default router;
