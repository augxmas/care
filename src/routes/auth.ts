import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { sendEmail, getSystemVars } from '../services/email.service';
import { generateVerificationCode } from '../utils/id-generator';
import { uploadBizCert } from '../middleware/upload';
import { generateTempPassword, PW_PATTERN } from '../utils/password';
import crypto from 'crypto';

const router = Router();

function getClientIp(req: Request): string {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
}

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// 이메일 인증코드 발송
router.post('/send-verification', async (req: Request, res: Response) => {
  const { email, contact_name } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력하세요.' });

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.execute(
    `INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)`,
    [email, code, expiresAt]
  );

  try {
    await sendEmail({
      templateKey: 'email_verification',
      to: email,
      vars: { contact_name: contact_name || '담당자', code },
    });
    res.json({ ok: true });
  } catch (e: any) {
    console.log(`[AI Studio Sandbox Bypass] Email verification code for ${email} is: ${code}`);
    res.status(400).json({ error: `메일 발송에 실패했지만 샌드박스 테스트용 인증코드가 발급되었습니다.<br><br><strong>인증코드: ${code}</strong>` });
  }
});

// 인증코드 확인
router.post('/verify-code', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM email_verifications
     WHERE email = ? AND code = ? AND verified = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code]
  );
  if (!rows.length) return res.status(400).json({ error: '인증코드가 올바르지 않거나 만료되었습니다.' });

  await pool.execute(`UPDATE email_verifications SET verified = 1 WHERE id = ?`, [rows[0].id]);
  res.json({ ok: true });
});

// 광고주 회원가입
router.post('/register', uploadBizCert.single('biz_cert'), async (req: Request, res: Response) => {
  const {
    company_name, business_no, ceo_name, address1, address2, postal_code,
    contact_name, contact_mobile, contact_phone, contact_email,
    password, push_consent, email_consent, terms_consent, privacy_consent,
  } = req.body;

  if (!terms_consent || !privacy_consent) {
    return res.status(400).json({ error: '이용약관 및 개인정보 동의가 필요합니다.' });
  }

  // 이메일 인증 확인
  const [verified] = await pool.execute<any[]>(
    `SELECT id FROM email_verifications WHERE email = ? AND verified = 1 ORDER BY id DESC LIMIT 1`,
    [contact_email]
  );
  if (!verified.length) return res.status(400).json({ error: '이메일 인증이 필요합니다.' });

  // 비밀번호 검증
  const pwPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
  if (!pwPattern.test(password)) {
    return res.status(400).json({ error: '비밀번호는 대소문자, 숫자, 특수문자를 포함한 8자리 이상이어야 합니다.' });
  }

  const emailHash = hashEmail(contact_email);

  // 중복 확인
  const [dup] = await pool.execute<any[]>(
    'SELECT id FROM advertisers WHERE email_hash = ? OR business_no = ?',
    [emailHash, business_no]
  );
  if (dup.length) return res.status(400).json({ error: '이미 등록된 이메일 또는 사업자등록번호입니다.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const bizCertPath = req.file ? req.file.path : null;
  const bizCertName = req.file ? req.file.originalname : null;

  const [result] = await pool.execute<any>(
    `INSERT INTO advertisers
     (company_name, business_no, ceo_name, address1, address2, postal_code,
      contact_name, contact_mobile, contact_phone, contact_email, email_hash, password_hash,
      push_consent, email_consent, terms_consent, privacy_consent, biz_cert_path, biz_cert_name, email_verified)
     VALUES (?,?,fn_encrypt(?),?,?,?,fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),fn_encrypt(?),?,?,?,?,?,?,?,?,1)`,
    [
      company_name, business_no, ceo_name, address1, address2 || '', postal_code,
      contact_name, contact_mobile, contact_phone || '', contact_email, emailHash, passwordHash,
      push_consent ? 1 : 0, email_consent ? 1 : 0, 1, 1,
      bizCertPath, bizCertName,
    ]
  );

  const advertiserId = result.insertId;

  // 광고주에게 접수 안내 메일
  try {
    await sendEmail({
      templateKey: 'registration_submitted',
      to: contact_email,
      vars: { contact_name, company_name },
      advertiserId,
    });
  } catch {}

  // Supervisor에게 알림
  try {
    await sendEmail({
      templateKey: 'registration_submitted_supervisor',
      to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
      vars: { company_name, business_no, ceo_name, contact_name, contact_email, contact_mobile },
      advertiserId,
    });
  } catch {}

  res.json({ ok: true, message: '회원가입 신청이 완료되었습니다. 승인 후 로그인이 가능합니다.' });
});

// 통합 로그인 — role: advertiser(관리자) / doctor(의사) / manager(담당자)
router.post('/login', async (req: Request, res: Response) => {
  const role = ['advertiser', 'doctor', 'manager'].includes(req.body.role) ? req.body.role : 'advertiser';
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });

  const ip = getClientIp(req);

  if (role === 'advertiser') {
    const { business_no } = req.body;
    if (!business_no) return res.status(400).json({ error: '사업자등록번호를 입력하세요.' });

    const emailHash = hashEmail(email);
    const [rows] = await pool.execute<any[]>(
      `SELECT id, password_hash, status, company_name, business_no,
              password_reset_required,
              fn_decrypt(contact_name) AS contact_name,
              fn_decrypt(contact_email) AS contact_email,
              last_login_ip, last_login_at
         FROM advertisers WHERE email_hash = ?`,
      [emailHash]
    );
    if (!rows.length) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });
    const advertiser = rows[0];

    const normInput  = String(business_no).replace(/-/g, '');
    const normStored = String(advertiser.business_no).replace(/-/g, '');
    if (normInput !== normStored)
      return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

    const valid = await bcrypt.compare(password, advertiser.password_hash);
    if (!valid) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

    if (advertiser.status === 'pending')    return res.status(403).json({ error: '관리자 승인 대기 중입니다.' });
    if (advertiser.status === 'rejected')   return res.status(403).json({ error: '가입이 취소된 계정입니다.' });
    if (advertiser.status === 'terminated') return res.status(403).json({ error: '종료된 계정입니다.' });

    const prevIp = advertiser.last_login_ip;
    const prevAt = advertiser.last_login_at;
    await pool.execute(
      'UPDATE advertisers SET last_login_ip = ?, last_login_at = NOW() WHERE id = ?',
      [ip, advertiser.id]
    );
    await pool.execute(
      `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('advertiser', ?, ?, ?)`,
      [String(advertiser.id), ip, req.sessionID]
    );

    (req.session as any).advertiser = {
      id:            advertiser.id,
      company_name:  advertiser.company_name,
      contact_name:  advertiser.contact_name,
      contact_email: advertiser.contact_email,
    };
    (req.session as any).user = {
      role: 'advertiser',
      id: advertiser.id,
      name: advertiser.contact_name,
      email: advertiser.contact_email,
    };
    (req.session as any).lastActivity = Date.now();

    return res.json({
      ok:            true,
      role:          'advertiser',
      resetRequired: advertiser.password_reset_required === 1,
      contact_name:  advertiser.contact_name,
      company_name:  advertiser.company_name,
      prevIp, prevAt,
      message: '환영합니다.',
    });
  }

  // 의사/담당자 로그인 — doctors / managers 테이블
  const table = role === 'doctor' ? 'doctors' : 'managers';
  const [staffRows] = await pool.execute<any[]>(
    `SELECT s.id, s.name, s.email, s.password_hash, s.status, s.advertiser_id,
            a.company_name, a.business_no,
            fn_decrypt(a.contact_email) AS adv_email,
            fn_decrypt(a.contact_name)  AS adv_name
       FROM ${table} s
       INNER JOIN advertisers a ON a.id = s.advertiser_id
       WHERE s.email = ? AND s.is_deleted = 0`,
    [email]
  );
  if (!staffRows.length) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });
  const staff = staffRows[0];

  // 의사/담당자도 소속 병원의 사업자등록번호 일치 필요
  const { business_no: staffBizNo } = req.body;
  if (!staffBizNo) return res.status(400).json({ error: '사업자등록번호를 입력하세요.' });
  if (String(staffBizNo).replace(/-/g, '') !== String(staff.business_no || '').replace(/-/g, ''))
    return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  if (!staff.password_hash) return res.status(401).json({ error: '비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요.' });
  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  if (staff.status && staff.status !== 'active')
    return res.status(403).json({ error: '활성 상태가 아닌 계정입니다.' });

  await pool.execute(
    `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES (?, ?, ?, ?)`,
    [role, String(staff.id), ip, req.sessionID]
  );

  // 부모 광고주 세션도 함께 설정 (기존 미들웨어 + 데이터 격리 유지)
  (req.session as any).advertiser = {
    id:            staff.advertiser_id,
    company_name:  staff.company_name,
    contact_name:  staff.adv_name,
    contact_email: staff.adv_email,
  };
  (req.session as any).user = {
    role,
    id:    staff.id,
    name:  staff.name,
    email: staff.email,
  };
  (req.session as any).lastActivity = Date.now();

  res.json({
    ok:           true,
    role,
    contact_name: staff.name,
    company_name: staff.company_name,
    message: '환영합니다.',
  });
});

// 비밀번호 분실 - 임시비밀번호 발급
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { business_no, email } = req.body;
  if (!business_no || !email)
    return res.status(400).json({ error: '사업자등록번호와 이메일을 입력하세요.' });

  const emailHash = hashEmail(email);
  const [rows] = await pool.execute<any[]>(
    `SELECT id, business_no, status,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_email) AS contact_email
     FROM advertisers WHERE email_hash = ?`,
    [emailHash]
  );

  // 계정이 없거나 사업자등록번호 불일치 시 동일 메시지로 보안 처리
  if (!rows.length) {
    return res.json({ ok: true, message: '입력하신 정보와 일치하는 계정이 있으면 임시비밀번호가 발송됩니다.' });
  }

  const adv = rows[0];
  const normInput  = String(business_no).replace(/-/g, '');
  const normStored = String(adv.business_no).replace(/-/g, '');
  if (normInput !== normStored) {
    return res.json({ ok: true, message: '입력하신 정보와 일치하는 계정이 있으면 임시비밀번호가 발송됩니다.' });
  }

  if (adv.status !== 'approved') {
    return res.status(403).json({ error: '승인된 계정만 비밀번호를 재설정할 수 있습니다.' });
  }

  const tempPw = generateTempPassword();
  const hash   = await bcrypt.hash(tempPw, 12);

  await pool.execute(
    'UPDATE advertisers SET password_hash = ?, password_reset_required = 1 WHERE id = ?',
    [hash, adv.id]
  );

  try {
    await sendEmail({
      templateKey: 'temp_password',
      to: adv.contact_email,
      vars: { contact_name: adv.contact_name, temp_password: tempPw },
      advertiserId: adv.id,
    });
  } catch (e: any) {
    return res.status(500).json({ error: '이메일 발송에 실패했습니다: ' + e.message });
  }

  res.json({ ok: true, message: '임시비밀번호가 이메일로 발송되었습니다.' });
});

// 비밀번호 재설정 (로그인 후 강제 변경)
router.post('/reset-password', async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요.' });

  const pwPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
  if (!pwPattern.test(new_password))
    return res.status(400).json({ error: '새 비밀번호는 대소문자, 숫자, 특수문자를 포함한 8자리 이상이어야 합니다.' });

  const [rows] = await pool.execute<any[]>(
    'SELECT password_hash FROM advertisers WHERE id = ?',
    [adv.id]
  );
  if (!rows.length) return res.status(400).json({ error: '계정을 찾을 수 없습니다.' });

  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(400).json({ error: '현재 비밀번호(임시비밀번호)가 올바르지 않습니다.' });

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.execute(
    'UPDATE advertisers SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
    [newHash, adv.id]
  );

  res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
});

// 프로필 조회
router.get('/profile', async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });

  const [rows] = await pool.execute<any[]>(
    `SELECT company_name, business_no,
            fn_decrypt(ceo_name) AS ceo_name,
            address1, address2, postal_code,
            fn_decrypt(contact_name) AS contact_name,
            fn_decrypt(contact_mobile) AS contact_mobile,
            fn_decrypt(contact_phone) AS contact_phone,
            fn_decrypt(contact_email) AS contact_email,
            push_consent, email_consent,
            biz_cert_path, biz_cert_name
     FROM advertisers WHERE id = ?`,
    [adv.id]
  );
  if (!rows.length) return res.status(400).json({ error: '계정을 찾을 수 없습니다.' });

  const profile = { ...rows[0] };
  profile.has_biz_cert = !!profile.biz_cert_path;
  delete profile.biz_cert_path;
  res.json({ ok: true, profile });
});

// 사업자등록증 파일 inline 서빙 (로그인한 광고주 본인만)
router.get('/biz-cert', async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });

  const fs = require('fs');
  const path = require('path');
  const [rows] = await pool.execute<any[]>(
    'SELECT biz_cert_path, biz_cert_name FROM advertisers WHERE id = ?',
    [adv.id]
  );
  if (!rows.length || !rows[0].biz_cert_path) {
    return res.status(404).json({ error: '파일이 등록되지 않았습니다.' });
  }
  let filePath: string = rows[0].biz_cert_path;
  if (!fs.existsSync(filePath)) {
    const basename = path.basename(filePath.replace(/\\/g, '/'));
    const fallback = path.join(process.cwd(), 'uploads', 'biz-certs', basename);
    if (!fs.existsSync(fallback)) {
      return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    }
    filePath = fallback;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.pdf' ? 'application/pdf'
             : ext === '.png' ? 'image/png'
             : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
             : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rows[0].biz_cert_name || 'biz_cert' + ext)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// 프로필 수정
router.put('/profile', async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });

  const { contact_name, contact_mobile, contact_phone, address1, address2, postal_code, push_consent, email_consent } = req.body;

  if (!contact_name || !contact_mobile || !address1 || !postal_code)
    return res.status(400).json({ error: '필수 정보를 모두 입력하세요.' });

  await pool.execute(
    `UPDATE advertisers SET
       contact_name   = fn_encrypt(?),
       contact_mobile = fn_encrypt(?),
       contact_phone  = fn_encrypt(?),
       address1       = ?,
       address2       = ?,
       postal_code    = ?,
       push_consent   = ?,
       email_consent  = ?
     WHERE id = ?`,
    [
      contact_name, contact_mobile, contact_phone || '',
      address1, address2 || '', postal_code,
      push_consent ? 1 : 0, email_consent ? 1 : 0,
      adv.id,
    ]
  );

  (req.session as any).advertiser.contact_name = contact_name;
  res.json({ ok: true, message: '프로필이 업데이트되었습니다.' });
});

// 로그아웃
router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.sessionID;
  await pool.execute(
    `UPDATE login_histories SET logout_at = NOW() WHERE session_id = ? AND logout_at IS NULL`,
    [sessionId]
  );
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// 세션 확인
router.get('/me', (req: Request, res: Response) => {
  const sess: any = req.session;
  // 고객(환자) 세션
  if (sess.customer) {
    return res.json({
      ok: true,
      user: {
        role:          'customer',
        id:            sess.customer.id,
        advertiser_id: sess.customer.advertiser_id,
        name:          sess.customer.name,
        email:         sess.customer.email,
        company_name:  sess.customer.company_name || '',
        resetRequired: sess.customer.password_reset_required === 1,
      },
    });
  }
  const adv = sess.advertiser;
  if (!adv) return res.status(401).json({ error: 'not_logged_in' });
  const u = sess.user;
  res.json({
    ok: true,
    user: { ...adv, role: u?.role || 'advertiser', user_id: u?.id, name: u?.name || adv.contact_name },
  });
});

// 세션 연장
router.post('/heartbeat', (req: Request, res: Response) => {
  if ((req.session as any).advertiser || (req.session as any).supervisor || (req.session as any).customer) {
    (req.session as any).lastActivity = Date.now();
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'not_logged_in' });
});

// ── 고객(환자) 로그인 ──────────────────────────────────────
// 병원별 이메일 유니크이므로 통보메일 링크의 ?h=<advertiser_id> 로 병원을 좁힌다.
router.post('/customer-login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const advParam = req.body.advertiser_id ? parseInt(String(req.body.advertiser_id)) : null;
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력하세요.' });

  const ip = getClientIp(req);
  let where = 'WHERE c.email = ? AND c.is_deleted = 0 AND c.status = \'active\'';
  const params: any[] = [email];
  if (advParam) { where += ' AND c.advertiser_id = ?'; params.push(advParam); }

  const [rows] = await pool.execute<any[]>(
    `SELECT c.id, c.advertiser_id, c.name, c.email, c.password_hash, c.password_reset_required,
            a.company_name
       FROM customers c
       INNER JOIN advertisers a ON a.id = c.advertiser_id
       ${where}`,
    params
  );
  if (!rows.length) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  // 동일 이메일이 복수 병원에 존재하면 병원 선택 필요
  if (rows.length > 1 && !advParam) {
    return res.status(409).json({
      error: '해당 이메일이 여러 병원에 등록되어 있습니다. 병원을 선택하세요.',
      hospitals: rows.map((r: any) => ({ advertiser_id: r.advertiser_id, company_name: r.company_name })),
    });
  }
  const customer = rows[0];
  if (!customer.password_hash) return res.status(401).json({ error: '비밀번호가 설정되지 않았습니다.' });
  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) return res.status(401).json({ error: '입력하신 정보가 올바르지 않습니다.' });

  await pool.execute(
    'UPDATE customers SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?',
    [ip, customer.id]
  );
  await pool.execute(
    `INSERT INTO login_histories (user_type, user_id, login_ip, session_id) VALUES ('customer', ?, ?, ?)`,
    [String(customer.id), ip, req.sessionID]
  );

  (req.session as any).customer = {
    id:            customer.id,
    advertiser_id: customer.advertiser_id,
    name:          customer.name,
    email:         customer.email,
    company_name:  customer.company_name,
    password_reset_required: customer.password_reset_required,
  };
  (req.session as any).user = { role: 'customer', id: customer.id, name: customer.name, email: customer.email };
  (req.session as any).lastActivity = Date.now();

  res.json({
    ok: true,
    role: 'customer',
    name: customer.name,
    company_name: customer.company_name,
    resetRequired: customer.password_reset_required === 1,
    message: '환영합니다.',
  });
});

// 고객 비밀번호 재설정 (강제 변경)
router.post('/customer-reset-password', async (req: Request, res: Response) => {
  const cust = (req.session as any).customer;
  if (!cust) return res.status(401).json({ error: '로그인이 필요합니다.' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력하세요.' });
  if (!PW_PATTERN.test(new_password))
    return res.status(400).json({ error: '새 비밀번호는 대소문자, 숫자, 특수문자를 포함한 8자리 이상이어야 합니다.' });

  const [rows] = await pool.execute<any[]>('SELECT password_hash FROM customers WHERE id = ?', [cust.id]);
  if (!rows.length) return res.status(400).json({ error: '계정을 찾을 수 없습니다.' });
  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(400).json({ error: '현재 비밀번호가 올바르지 않습니다.' });

  const newHash = await bcrypt.hash(new_password, 12);
  await pool.execute(
    'UPDATE customers SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
    [newHash, cust.id]
  );
  (req.session as any).customer.password_reset_required = 0;
  res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
});

export default router;
