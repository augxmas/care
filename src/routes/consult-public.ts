import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pool, { getIsSqlite } from '../config/database';
import { sendEmail } from '../services/email.service';
import { uploadChatFile } from '../middleware/upload';
import { broadcastAttachment } from '../realtime/chat';
import { appendChatTrainingLog } from '../services/chat-log.service';
import { countryToLang, langLabel, COMMON_LANGS } from '../utils/lang';

const router = Router();
const SECRET = process.env.SESSION_SECRET || 'monorama_secret';
type ConsultLanguage = 'ko' | 'th' | 'en';

function consultLanguage(value: unknown): ConsultLanguage {
  const code = String(value || 'en').toLowerCase().split('-')[0];
  return code === 'ko' || code === 'th' ? code : 'en';
}
function emailHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
}
function consultEmail(language: ConsultLanguage, kind: 'otp' | 'registered', values: { hospital: string; code: string; chatUrl?: string; title?: string }) {
  const hospital = emailHtml(values.hospital), code = emailHtml(values.code), chatUrl = emailHtml(values.chatUrl), title = emailHtml(values.title);
  const copy = {
    ko: kind === 'otp'
      ? { subject:`[${hospital}] 온라인 상담 인증코드`, heading:`${hospital} 온라인 1:1 상담`, intro:'온라인 상담 본인확인을 위한 인증코드입니다.', password:'이 6자리 코드는 상담 등록 후 제공되는 채팅 링크에 접속할 때 사용하는 비밀번호입니다.', keep:'상담 내역 확인과 채팅 참여에 필요하므로 안전하게 보관해 주세요.' }
      : { subject:`[${hospital}] 상담 등록 및 채팅 안내`, heading:'상담이 등록되었습니다.', intro:`상담 “${title}”이 정상적으로 등록되었습니다.`, password:'아래 채팅 링크에서 이메일과 6자리 인증코드를 비밀번호로 입력해 주세요.', keep:'인증코드를 재발급하면 이전 코드는 사용할 수 없습니다.' },
    th: kind === 'otp'
      ? { subject:`[${hospital}] รหัสยืนยันสำหรับการปรึกษาออนไลน์`, heading:`ปรึกษาออนไลน์แบบ 1:1 กับ ${hospital}`, intro:'นี่คือรหัสยืนยันตัวตนสำหรับการปรึกษาออนไลน์ของคุณ', password:'รหัส 6 หลักนี้คือรหัสผ่านสำหรับเข้าใช้ลิงก์แชตที่จะแจ้งให้ทราบหลังส่งคำปรึกษา', keep:'โปรดเก็บรหัสนี้ไว้อย่างปลอดภัยเพื่อดูประวัติการปรึกษาและเข้าร่วมแชต' }
      : { subject:`[${hospital}] ส่งคำปรึกษาเรียบร้อยแล้วและลิงก์แชต`, heading:'ส่งคำปรึกษาเรียบร้อยแล้ว', intro:`คำปรึกษา “${title}” ได้รับการลงทะเบียนแล้ว`, password:'ที่ลิงก์แชตด้านล่าง กรุณากรอกอีเมลและรหัสยืนยัน 6 หลักเป็นรหัสผ่าน', keep:'หากขอรหัสใหม่ รหัสเดิมจะไม่สามารถใช้ได้' },
    en: kind === 'otp'
      ? { subject:`[${hospital}] Online consultation verification code`, heading:`${hospital} private 1:1 consultation`, intro:'Here is your verification code for the online consultation.', password:'This 6-digit code is also the password for the chat link provided after you submit your consultation.', keep:'Keep it safe—you will need it to view your consultation and join the chat.' }
      : { subject:`[${hospital}] Consultation submitted and chat link`, heading:'Your consultation has been submitted.', intro:`Your consultation “${title}” was registered successfully.`, password:'Open the chat link below and enter your email and 6-digit verification code as the password.', keep:'If you request a new code, the previous code will no longer work.' },
  }[language];
  const chat = kind === 'registered' ? `<div style="text-align:center;margin:24px 0"><a href="${chatUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold">${language==='ko'?'채팅 시작':language==='th'?'เริ่มแชต':'Start chat'}</a></div><p style="font-size:12px;color:#64748b;word-break:break-all">${chatUrl}</p>` : '';
  return {
    subject: copy.subject,
    html: `<div style="font-family:Arial,'Noto Sans KR','Noto Sans Thai',sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e2e8f0;border-radius:10px"><h2 style="color:#2563eb;text-align:center">${copy.heading}</h2><p>${copy.intro}</p><div style="background:#eff6ff;border:2px solid #2563eb;border-radius:8px;padding:20px;text-align:center;margin:20px 0"><div style="font-size:13px;color:#64748b">${language==='ko'?'인증코드 · 채팅 비밀번호':language==='th'?'รหัสยืนยัน · รหัสผ่านแชต':'Verification code · Chat password'}</div><div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#2563eb;margin-top:8px">${code}</div></div><div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:14px;color:#9a3412"><strong>${copy.password}</strong><br><span style="font-size:13px">${copy.keep}</span></div>${chat}</div>`,
  };
}

// ── 유틸 ────────────────────────────────────────────────────
function genCode(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
function clientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}
function emailOk(e: any): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '')); }
function advOf(req: Request): number { return parseInt(String(req.query.h || req.body.h || '0')); }
function utf8FileName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}

// stateless 서명 토큰 (board/view) — 테이블 불필요
function signToken(payload: any): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token: string): any | null {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
const MIN = 60 * 1000;

let chatTokenSchemaReady: Promise<void> | null = null;
async function ensureChatTokenSchema(): Promise<void> {
  if (getIsSqlite()) return;
  if (!chatTokenSchemaReady) {
    chatTokenSchemaReady = (async () => {
      const ensureColumn = async (column: string, definition: string) => {
        const [rows] = await pool.execute<any[]>(
          `SELECT 1 FROM information_schema.columns
             WHERE table_schema=DATABASE() AND table_name='chat_tokens' AND column_name=? LIMIT 1`,
          [column],
        );
        if (!rows.length) await pool.execute(`ALTER TABLE chat_tokens ADD COLUMN \`${column}\` ${definition}`);
      };
      await ensureColumn('advertiser_id', 'BIGINT NULL AFTER token');
      await ensureColumn('customer_email', 'VARCHAR(255) NULL AFTER conversation_id');
      await ensureColumn('revoked', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER expires_at');
      const [legacyColumns] = await pool.execute<any[]>(
        `SELECT column_name FROM information_schema.columns
           WHERE table_schema=DATABASE() AND table_name='chat_tokens' AND column_name='participant_type'`,
      );
      if (legacyColumns.length) {
        await pool.execute('ALTER TABLE chat_tokens MODIFY participant_type LONGTEXT NULL');
      }
    })().catch((error) => {
      chatTokenSchemaReady = null;
      throw error;
    });
  }
  await chatTokenSchemaReady;
}

async function hospitalName(adv: number): Promise<string> {
  const [r] = await pool.execute<any[]>('SELECT company_name FROM advertisers WHERE id=?', [adv]);
  return r.length ? r[0].company_name : '병원';
}

// 상담 자격증명: 인증코드를 (병원+이메일)별 비밀번호처럼 보관. 재발급 시 갱신.
async function saveCredential(adv: number, email: string, code: string): Promise<void> {
  const hash = await bcrypt.hash(code, 12);
  await pool.execute(
    `INSERT INTO consult_credentials (advertiser_id, email, code_hash) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash), updated_at=NOW()`,
    [adv, email, hash]
  );
}
// 이메일 + 인증코드(=비밀번호) 검증
async function checkCredential(adv: number, email: string, code: string): Promise<boolean> {
  if (!email || !code) return false;
  const [r] = await pool.execute<any[]>(
    'SELECT code_hash FROM consult_credentials WHERE advertiser_id=? AND email=? LIMIT 1', [adv, email]);
  if (!r.length) return false;
  return bcrypt.compare(code, r[0].code_hash);
}

// 이메일로 고객 매칭 (병원 격리) — hpid/visit/customer 해결
async function resolveCustomer(adv: number, email: string) {
  const [v] = await pool.execute<any[]>(
    `SELECT cv.id AS visit_id, cv.hospital_patient_id, cv.name
       FROM customer_visits cv INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND cv.email = ?
      ORDER BY cv.visited_at DESC LIMIT 1`, [adv, email]
  );
  const [cu] = await pool.execute<any[]>(
    'SELECT id, name FROM customers WHERE advertiser_id=? AND email=? AND is_deleted=0 LIMIT 1', [adv, email]
  );
  return {
    visit_id: v.length ? v[0].visit_id : null,
    hospital_patient_id: v.length ? v[0].hospital_patient_id : null,
    customer_id: cu.length ? cu[0].id : null,
    name: (v.length && v[0].name) || (cu.length && cu[0].name) || null,
  };
}

// ── 병원 메타 ───────────────────────────────────────────────
router.get('/meta', async (req: Request, res: Response) => {
  const adv = advOf(req);
  if (!adv) return res.status(400).json({ error: '잘못된 접근입니다.' });
  res.json({ ok: true, hospital_name: await hospitalName(adv) });
});

// ── 인증코드 발송 ───────────────────────────────────────────
router.post('/send-code', async (req: Request, res: Response) => {
  const adv = advOf(req); const email = String(req.body.email || '').trim();
  const language = consultLanguage(req.body.language);
  if (!adv) return res.status(400).json({ error: '잘못된 접근입니다.' });
  if (!emailOk(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
  // 레이트리밋: email당 10분 5회 + IP 10분 10회
  const [er] = await pool.execute<any[]>(
    'SELECT COUNT(*) n FROM email_verifications WHERE email=? AND created_at > NOW() - INTERVAL 10 MINUTE', [email]
  );
  if (er[0].n >= 5) return res.status(429).json({ error: '잠시 후 다시 시도해 주세요. (요청이 너무 많습니다)' });

  const code = genCode();
  const expiresAt = new Date(Date.now() + 10 * MIN);
  // 레이트리밋 카운트용 기록(검증은 consult_credentials로 함)
  await pool.execute('INSERT INTO email_verifications (email, code, expires_at, purpose) VALUES (?,?,?,?)',
    [email, code, expiresAt, 'consult']);
  // 인증코드 = 비밀번호로 지속 보관 (재발급 시 갱신)
  await saveCredential(adv, email, code);
  try {
    const hospital = await hospitalName(adv);
    const message = consultEmail(language, 'otp', { hospital, code });
    await sendEmail({ templateKey: `consult_otp_${language}`, to: email, vars: {}, subject: message.subject, html: message.html, advertiserId: adv });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: '인증코드 발송에 실패했습니다.' }); }
});

// ── 이메일 + 인증코드(비밀번호) 로그인 → board 토큰 ─────────
// 이전에 받은 코드가 있으면 재발급 없이 바로 진행. 코드는 만료되지 않음(재발급 시 갱신).
router.post('/verify-code', async (req: Request, res: Response) => {
  const adv = advOf(req); const email = String(req.body.email || '').trim();
  const code = String(req.body.code || '').trim();
  if (!adv || !email || !code) return res.status(400).json({ error: '이메일과 인증코드를 입력하세요.' });
  if (!(await checkCredential(adv, email, code)))
    return res.status(400).json({ error: '인증코드가 올바르지 않습니다. 코드를 모르시면 재발급 받으세요.' });
  const token = signToken({ k: 'board', email, adv, exp: Date.now() + 12 * 60 * MIN });
  res.json({ ok: true, boardToken: token, email });
});

function boardAuth(req: Request, adv: number): string | null {
  const p = verifyToken(String(req.body.boardToken || ''));
  if (!p || p.k !== 'board' || p.adv !== adv || !p.email) return null;
  return p.email;
}

// ── 글 작성 ─────────────────────────────────────────────────
router.post('/posts', async (req: Request, res: Response) => {
  const adv = advOf(req);
  const email = boardAuth(req, adv);
  if (!email) return res.status(401).json({ error: '본인확인이 필요합니다.' });
  const title = String(req.body.title || '').trim().slice(0, 200);
  const body = String(req.body.body || '').trim();
  const code = String(req.body.code || '').trim();
  const language = consultLanguage(req.body.language);
  if (!title || !body) return res.status(400).json({ error: '제목과 내용을 입력하세요.' });
  if (!code || !(await checkCredential(adv, email, code))) return res.status(400).json({ error: '인증코드가 올바르지 않습니다.' });

  const cust = await resolveCustomer(adv, email);
  const [r]: any = await pool.execute(
    `INSERT INTO consult_posts
       (advertiser_id, author_email, hospital_patient_id, visit_id, customer_id, title, body)
     VALUES (?,?,?,?,?,?,?)`,
    [adv, email, cust.hospital_patient_id, cust.visit_id, cust.customer_id, title, body]
  );
  const postId = Number(r.insertId);
  const [conversation]: any = await pool.execute(
    `INSERT INTO chat_conversations
       (advertiser_id,post_id,customer_email,customer_id,hospital_patient_id,customer_lang,status)
     VALUES (?,?,?,?,?,?,?)`,
    [adv, postId, email, cust.customer_id, cust.hospital_patient_id, language, 'open'],
  );
  await pool.execute('UPDATE consult_posts SET conversation_id=? WHERE id=? AND advertiser_id=?', [conversation.insertId, postId, adv]);
  await pool.execute(
    `INSERT INTO chat_participants
       (conversation_id,advertiser_id,participant_type,participant_id,display_name,lang)
     VALUES (?,?,'customer',NULL,?,?)`,
    [conversation.insertId, adv, email, language],
  );
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const chatUrl = `${baseUrl}/consult-chat?h=${adv}&p=${postId}`;
  let emailSent = true;
  try {
    const hospital = await hospitalName(adv);
    const message = consultEmail(language, 'registered', { hospital, code, chatUrl, title });
    await sendEmail({ templateKey: `consult_registered_${language}`, to: email, vars: {}, subject: message.subject, html: message.html, advertiserId: adv });
  } catch (error) {
    emailSent = false;
    console.error('[consult] registration email failed', (error as any)?.message);
  }
  res.json({ ok: true, id: postId, chat_url: chatUrl, email_sent: emailSent });
});

router.post('/posts/:id/attachments', async (req: Request, res: Response, next: NextFunction) => {
  const adv = advOf(req);
  const token = verifyToken(String(req.query.boardToken || ''));
  const postId = parseInt(req.params.id);
  if (!token || token.k !== 'board' || token.adv !== adv || !token.email) {
    return res.status(401).json({ error: '본인확인이 필요합니다.' });
  }
  const [posts] = await pool.execute<any[]>(
    'SELECT id FROM consult_posts WHERE id=? AND advertiser_id=? AND author_email=? AND is_deleted=0',
    [postId, adv, token.email],
  );
  if (!posts.length) return res.status(404).json({ error: '상담을 찾을 수 없습니다.' });
  (req as any).chatCtx = { advertiserId: adv };
  uploadChatFile.array('files', 5)(req, res, async (error: any) => {
    if (error) return res.status(400).json({ error: error.message || '파일을 업로드하지 못했습니다.' });
    try {
      const files = (req.files as Express.Multer.File[]) || [];
      for (const file of files) {
        const rel = `uploads/active/${adv}/chat/${file.filename}`;
        await pool.execute(
          `INSERT INTO consult_post_attachments
           (advertiser_id,post_id,file_path,original_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?)`,
          [adv, postId, rel, utf8FileName(file.originalname), file.mimetype, file.size],
        );
      }
      res.json({ ok: true, count: files.length });
    } catch (uploadError) { next(uploadError); }
  });
});

// ── 내 글 목록 (제목·상태만) ────────────────────────────────
router.post('/my-posts', async (req: Request, res: Response) => {
  const adv = advOf(req);
  const email = boardAuth(req, adv);
  if (!email) return res.status(401).json({ error: '본인확인이 필요합니다.' });
  const [rows] = await pool.execute<any[]>(
    `SELECT p.id, p.title, p.status, DATE_FORMAT(p.created_at,'%Y-%m-%d %H:%i') AS created_at,
            (SELECT COUNT(*) FROM consult_answers a WHERE a.post_id=p.id AND a.is_deleted=0) AS answer_count
       FROM consult_posts p
      WHERE p.advertiser_id=? AND p.author_email=? AND p.is_deleted=0
      ORDER BY p.created_at DESC`, [adv, email]
  );
  res.json({ ok: true, data: rows });
});

// 글 소유 확인: board 토큰(이메일 일치) · view 토큰 · 이메일+인증코드
async function postAuth(req: Request, adv: number, postId: number): Promise<any | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0', [postId, adv]);
  if (!rows.length) return null;
  const post = rows[0];
  // 1) board 토큰(로그인) 이메일 일치
  const email = boardAuth(req, adv);
  if (email && email === post.author_email) return post;
  // 2) view 토큰
  const vt = verifyToken(String(req.body.token || req.query.token || ''));
  if (vt && vt.k === 'view' && vt.adv === adv && vt.postId === postId) return post;
  // 3) 이메일 + 인증코드(비밀번호)
  const e = String(req.body.email || '').trim(); const c = String(req.body.code || '').trim();
  if (e && c && e === post.author_email && await checkCredential(adv, e, c)) return post;
  return null;
}

// ── 글 본인확인 → view 토큰 ─────────────────────────────────
router.post('/posts/:id/auth', async (req: Request, res: Response) => {
  const adv = advOf(req); const id = parseInt(req.params.id);
  const post = await postAuth(req, adv, id);
  if (!post) return res.status(401).json({ error: '비밀번호가 올바르지 않거나 본인확인이 필요합니다.' });
  const token = signToken({ k: 'view', adv, postId: id, exp: Date.now() + 30 * MIN });
  res.json({ ok: true, viewToken: token });
});

// ── 글 상세 (작성자만: view 토큰) ───────────────────────────
router.get('/posts/:id', async (req: Request, res: Response) => {
  const adv = advOf(req); const id = parseInt(req.params.id);
  const vt = verifyToken(String(req.query.token || ''));
  if (!vt || vt.k !== 'view' || vt.adv !== adv || vt.postId !== id) {
    return res.status(401).json({ error: '본인확인이 필요합니다.' });
  }
  const [rows] = await pool.execute<any[]>(
    `SELECT id, title, body, status, hospital_patient_id, conversation_id,
            DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at
       FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0`, [id, adv]);
  if (!rows.length) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  const [answers] = await pool.execute<any[]>(
    `SELECT a.id, a.author_type, a.body, a.chat_link_token,
            DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') AS created_at,
            CASE WHEN a.author_type='doctor' THEN d.name ELSE m.name END AS author_name
       FROM consult_answers a
       LEFT JOIN doctors d ON d.id=a.author_id AND a.author_type='doctor'
       LEFT JOIN managers m ON m.id=a.author_id AND a.author_type='manager'
      WHERE a.post_id=? AND a.is_deleted=0 ORDER BY a.created_at`, [id]);
  const [attachments] = await pool.execute<any[]>(
    'SELECT id,original_name,mime_type,size_bytes FROM consult_post_attachments WHERE advertiser_id=? AND post_id=? ORDER BY id',
    [adv, id],
  );
  res.json({ ok: true, post: rows[0], answers, attachments });
});

router.get('/posts/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  const adv = advOf(req); const id = parseInt(req.params.id);
  const vt = verifyToken(String(req.query.token || ''));
  if (!vt || vt.k !== 'view' || vt.adv !== adv || vt.postId !== id) {
    return res.status(401).json({ error: '본인확인이 필요합니다.' });
  }
  const [rows] = await pool.execute<any[]>(
    'SELECT file_path,original_name FROM consult_post_attachments WHERE id=? AND advertiser_id=? AND post_id=?',
    [req.params.attachmentId, adv, id],
  );
  if (!rows.length) return res.status(404).json({ error: '첨부파일을 찾을 수 없습니다.' });
  const filePath = path.resolve(process.cwd(), rows[0].file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '첨부파일이 존재하지 않습니다.' });
  res.download(filePath, rows[0].original_name);
});

// ── 글 수정 ─────────────────────────────────────────────────
router.put('/posts/:id', async (req: Request, res: Response) => {
  const adv = advOf(req); const id = parseInt(req.params.id);
  const post = await postAuth(req, adv, id);
  if (!post) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  const title = String(req.body.title || '').trim().slice(0, 200);
  const body = String(req.body.body || '').trim();
  if (!title || !body) return res.status(400).json({ error: '제목과 내용을 입력하세요.' });
  await pool.execute('UPDATE consult_posts SET title=?, body=? WHERE id=? AND advertiser_id=?', [title, body, id, adv]);
  res.json({ ok: true });
});

// ── 글 삭제 (소프트) ────────────────────────────────────────
router.delete('/posts/:id', async (req: Request, res: Response) => {
  const adv = advOf(req); const id = parseInt(req.params.id);
  const post = await postAuth(req, adv, id);
  if (!post) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  await pool.execute('UPDATE consult_posts SET is_deleted=1, deleted_at=NOW(), deleted_by=? WHERE id=? AND advertiser_id=?',
    ['고객', id, adv]);
  res.json({ ok: true });
});

// ── 채팅 입장: 답변 링크(p,t) + 이메일+코드 재인증 → chat 토큰 ──
router.get('/chat/meta', async (req: Request, res: Response) => {
  const adv = advOf(req); const p = parseInt(String(req.query.p || '0'));
  const [rows] = await pool.execute<any[]>(
    'SELECT title, author_email FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0', [p, adv]);
  if (!rows.length) return res.status(404).json({ error: '상담을 찾을 수 없습니다.' });
  res.json({ ok: true, title: rows[0].title, hospital_name: await hospitalName(adv) });
});

// ── 채팅 번역 언어 옵션 ─────────────────────────────────────
// 현재 고객정보(국적)에 존재하는 언어 + 공통 언어 목록('기타' 선택용)
router.get('/chat/lang-options', async (req: Request, res: Response) => {
  const adv = advOf(req);
  if (!adv) return res.status(400).json({ error: '잘못된 접근입니다.' });
  const [rows] = await pool.execute<any[]>(
    `SELECT DISTINCT cv.nationality FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND cv.nationality IS NOT NULL AND cv.nationality <> ''`, [adv]);
  const seen = new Map<string, string>();
  for (const r of rows) {
    const l = countryToLang(r.nationality);
    if (l && l !== 'ko') seen.set(l, langLabel(l)); // 한국어(스탭 언어)는 번역 대상에서 제외
  }
  const fromCustomers = [...seen.entries()].map(([code, label]) => ({ code, label }));
  const all = COMMON_LANGS.map((code) => ({ code, label: langLabel(code) }));
  res.json({ ok: true, fromCustomers, all });
});

router.post('/chat/join', async (req: Request, res: Response) => {
  const adv = advOf(req);
  const email = String(req.body.email || '').trim();
  const code = String(req.body.code || '').trim();
  const postId = parseInt(String(req.body.p || '0'));
  if (!adv || !email || !code || !postId) return res.status(400).json({ error: '입력값을 확인하세요.' });

  const [prows] = await pool.execute<any[]>(
    'SELECT id, author_email, conversation_id, customer_id FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0',
    [postId, adv]);
  if (!prows.length) return res.status(404).json({ error: '상담을 찾을 수 없습니다.' });
  const post = prows[0];
  if (post.author_email !== email) return res.status(403).json({ error: '작성자 이메일과 일치하지 않습니다.' });
  if (!post.conversation_id) return res.status(400).json({ error: '아직 답변/채팅이 준비되지 않았습니다.' });
  if (!(await checkCredential(adv, email, code)))
    return res.status(400).json({ error: '인증코드가 올바르지 않습니다. 코드를 모르시면 재발급 받으세요.' });

  // 고객 참가자 등록 (없으면)
  await pool.execute(
    `INSERT IGNORE INTO chat_participants (conversation_id, advertiser_id, participant_type, participant_id, display_name)
     VALUES (?,?, 'customer', NULL, ?)`, [post.conversation_id, adv, email]);

  // 등록 고객 여부 + 국적 기반 언어 자동 결정
  const [cvn] = await pool.execute<any[]>(
    `SELECT cv.nationality FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND cv.email = ? AND cv.nationality IS NOT NULL AND cv.nationality <> ''
      ORDER BY cv.visited_at DESC LIMIT 1`, [adv, email]);
  const knownCustomer = cvn.length > 0;
  const knownLang = knownCustomer ? countryToLang(cvn[0].nationality) : null;
  // 등록 고객이면 국적 언어를 대화에 자동 반영
  if (knownLang) {
    await pool.execute(
      "UPDATE chat_conversations SET customer_lang=? WHERE id=?",
      [knownLang, post.conversation_id]);
    await pool.execute(
      "UPDATE chat_participants SET lang=? WHERE conversation_id=? AND participant_type='customer'",
      [knownLang, post.conversation_id]);
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * MIN);
  // Some installations still have the legacy chat_tokens definition. Repair
  // the active database connection before writing so this route is safe even
  // when startup migrations were skipped by an older server process.
  await ensureChatTokenSchema();
  await pool.execute(
    'INSERT INTO chat_tokens (token, advertiser_id, conversation_id, customer_email, expires_at) VALUES (?,?,?,?,?)',
    [token, adv, post.conversation_id, email, expiresAt]);

  res.json({
    ok: true, chatToken: token, conversationId: post.conversation_id,
    hospital_name: await hospitalName(adv),
    knownCustomer, customerLang: knownLang || null,
  });
});

// ── 채팅 언어 설정 (미등록 고객이 번역 언어 선택) ───────────
router.post('/chat/set-lang', async (req: Request, res: Response) => {
  const token = String(req.body.chatToken || '');
  let lang = String(req.body.lang || '').trim().toLowerCase().slice(0, 8);
  if (!lang) lang = 'ko'; // 번역 불필요 → 스탭 언어로 설정(번역 스킵)
  const [t] = await pool.execute<any[]>(
    'SELECT conversation_id FROM chat_tokens WHERE token=? AND revoked=0 AND expires_at > NOW()', [token]);
  if (!t.length) return res.status(401).json({ error: '채팅 인증이 필요합니다.' });
  const cid = t[0].conversation_id;
  await pool.execute('UPDATE chat_conversations SET customer_lang=? WHERE id=?', [lang, cid]);
  await pool.execute("UPDATE chat_participants SET lang=? WHERE conversation_id=? AND participant_type='customer'", [lang, cid]);
  res.json({ ok: true });
});

// 채팅토큰 가드 (멀티파트 파싱 전, req.chatCtx 설정)
async function chatTokenGuard(req: Request, res: Response, next: NextFunction) {
  const token = req.query.token || req.headers['x-chat-token'];
  const cid = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT advertiser_id, conversation_id, customer_email FROM chat_tokens
      WHERE token=? AND revoked=0 AND expires_at > NOW()`, [String(token || '')]);
  if (!rows.length || rows[0].conversation_id !== cid) return res.status(401).json({ error: '채팅 인증이 필요합니다.' });
  (req as any).chatCtx = { advertiserId: rows[0].advertiser_id, conversationId: cid, email: rows[0].customer_email };
  next();
}

// multer 에러(txt 차단 등) → 400 JSON
function chatUpload(req: Request, res: Response, next: NextFunction) {
  uploadChatFile.single('file')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || '업로드 실패' });
    next();
  });
}

// ── 채팅 파일 업로드 (고객) ─────────────────────────────────
router.post('/conversations/:id/upload', chatTokenGuard, chatUpload, async (req: Request, res: Response) => {
  const cc = (req as any).chatCtx; const a = cc.advertiserId; const cid = cc.conversationId;
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const rel = `uploads/active/${a}/chat/${req.file.filename}`;
  const [att]: any = await pool.execute(
    `INSERT INTO chat_attachments (advertiser_id, conversation_id, uploader_type, uploader_id, file_path, original_name, mime_type, size_bytes)
     VALUES (?,?, 'customer', NULL, ?,?,?,?)`,
    [a, cid, rel, req.file.originalname, req.file.mimetype, req.file.size]);
  const [msg]: any = await pool.execute(
    `INSERT INTO chat_messages (advertiser_id, conversation_id, sender_type, sender_id, attachment_id) VALUES (?,?, 'customer', NULL, ?)`,
    [a, cid, att.insertId]);
  await pool.execute('UPDATE chat_conversations SET last_message_at=NOW() WHERE id=?', [cid]);
  const payload = {
    id: msg.insertId, conversation_id: cid, sender_type: 'customer', sender_id: null,
    original_text: null, attachment: { id: att.insertId, name: req.file.originalname, path: '/' + rel, mime: req.file.mimetype },
    unread: 1,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  await appendChatTrainingLog({
    event: 'attachment_created',
    advertiserId: a,
    conversationId: cid,
    messageId: msg.insertId,
    senderType: 'customer',
    senderId: null,
    customerEmail: cc.email,
    attachment: { id: att.insertId, name: req.file.originalname, path: '/' + rel, mime: req.file.mimetype },
  });
  const io = req.app.get('io'); if (io) broadcastAttachment(io, a, cid, payload);
  res.json({ ok: true });
});

// ── VIP 실시간 예약 및 상담 신청 접수 (홈페이지 VVIP 폼 전용) ──────────
router.post('/inquiry', async (req: Request, res: Response) => {
  try {
    let advId = advOf(req);
    if (!advId) {
      const [advs] = await pool.execute<any[]>('SELECT id FROM advertisers ORDER BY id LIMIT 1');
      if (advs.length) {
        advId = advs[0].id;
      } else {
        advId = 1;
      }
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const mobile = String(req.body.mobile || '').trim();
    const program = String(req.body.program || 'all').trim();
    const visitDate = String(req.body.visitDate || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !mobile) {
      return res.status(400).json({ error: '필수 입력 항목(성함, 이메일, 연락처)이 누락되었습니다.' });
    }

    const programLabels: Record<string, string> = {
      all: '전체 프로그램 종합 설계 상담',
      iv: '줄기세포 전신 정맥 주사 (항노화)',
      skin: '줄기세포 피부 시술 & 스킨부스터',
      fat: '줄기세포 하이브리드 지방이식'
    };
    const programText = programLabels[program] || program;

    const title = `[VIP 예약/상담] ${name}님의 VIP 신청 (${programText})`;
    const body = `[VIP 실시간 예약 및 상담 신청]
- 성함: ${name}
- 이메일: ${email}
- 연락처/메신저: ${mobile}
- 관심 시술: ${programText}
- 희망 방문 시기: ${visitDate || '미정'}

[상세 문의 및 증상 기술]
${message || '추가 문의 없음'}`;

    // 1) consult_posts에 삽입 (상담 게시판에서 즉시 확인 가능)
    const passwordHash = '$2b$12$zcQaLJYxCfmMrLZh/LoIw.V39lDcngV8l3KdEJjbRFkV3epHnONsO'; // 기본 비밀번호 해시 ('1234')
    const [postResult]: any = await pool.execute(
      `INSERT INTO consult_posts 
        (advertiser_id, author_email, title, body, password_hash, is_private, status, lang)
       VALUES (?, ?, ?, ?, ?, 1, 'new', 'th')`,
      [advId, email, title, body, passwordHash]
    );
    const postId = postResult.insertId;

    // 2) customer_visits (고객 방문/리드 목록)에도 삽입하여 CRM 포털 고객 목록에서 즉시 연동 확인 가능하게 함
    try {
      let campaignId = 'DIRECT';
      const [campaigns] = await pool.execute<any[]>(
        'SELECT id FROM campaigns WHERE advertiser_id=? LIMIT 1', [advId]
      );
      if (campaigns.length) {
        campaignId = campaigns[0].id;
      } else {
        const [anyCampaigns] = await pool.execute<any[]>('SELECT id FROM campaigns LIMIT 1');
        if (anyCampaigns.length) {
          campaignId = anyCampaigns[0].id;
        }
      }

      const ip = clientIp(req);
      const ua = String(req.headers['user-agent'] || '').slice(0, 500);

      await pool.execute(
        `INSERT INTO customer_visits 
          (campaign_id, name, email, mobile, nationality, visit_type, visitor_ip, user_agent, customer_note, channel)
         VALUES (?, ?, ?, ?, 'TH', 'lead', ?, ?, ?, 'direct')`,
        [campaignId, name, email, mobile, ip, ua, `[관심시술] ${programText} / [희망일] ${visitDate || '미정'}\n[문의] ${message}`]
      );
    } catch (visitErr) {
      console.warn('[Inquiry] Failed to insert into customer_visits:', visitErr);
    }

    res.json({ ok: true, message: '상담 예약 신청이 정상적으로 접수되었습니다.', postId });
  } catch (err: any) {
    console.error('[Inquiry Submit Error]', err);
    res.status(500).json({ error: '상담 접수 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
