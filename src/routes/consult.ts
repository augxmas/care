import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../config/database';
import { requireRole } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { sendEmail } from '../services/email.service';
import { uploadChatFile } from '../middleware/upload';
import { systemChat, translate } from '../services/llm.service';
import { broadcastAttachment } from '../realtime/chat';
import { appendChatTrainingLog } from '../services/chat-log.service';

const router = Router();

// multer 에러(txt 차단 등) → 400 JSON
function chatUpload(req: Request, res: Response, next: Function) {
  uploadChatFile.single('file')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || '업로드 실패' });
    next();
  });
}

const viewer = requireRole('advertiser', 'manager', 'doctor');
const scheduler = requireRole('advertiser', 'manager');

function adv(req: Request): number { return (req.session as any).advertiser.id; }
function sessRole(req: Request): string { return (req.session as any).user?.role || 'advertiser'; }
function sessId(req: Request): number { return (req.session as any).user?.id; }
function sessName(req: Request): string { return (req.session as any).user?.name || ''; }

// ── 상담 대시보드 통계 ──────────────────────────────────────
// 전체 상담수, 채팅중(대화 open) 상담수
router.get('/dashboard-stats', viewer, async (req: Request, res: Response) => {
  const a = adv(req);
  let where = 'WHERE p.advertiser_id=? AND p.is_deleted=0';
  const params: any[] = [a];
  if (sessRole(req) === 'doctor') { where += ' AND p.assigned_doctor_id=?'; params.push(sessId(req)); }
  const [rows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(cc.status='open'),0) AS chatting
       FROM consult_posts p
       LEFT JOIN chat_conversations cc ON cc.id = p.conversation_id
       ${where}`, params);
  const r: any = rows[0] || {};
  res.json({ ok: true, total: Number(r.total) || 0, chatting: Number(r.chatting) || 0 });
});

// ── 게시글 목록 ─────────────────────────────────────────────
router.get('/posts', viewer, async (req: Request, res: Response) => {
  const a = adv(req);
  let where = 'WHERE p.advertiser_id=? AND p.is_deleted=0';
  const params: any[] = [a];
  if (sessRole(req) === 'doctor') { where += ' AND p.assigned_doctor_id=?'; params.push(sessId(req)); }
  if (req.query.status) { where += ' AND p.status=?'; params.push(String(req.query.status)); }
  if (req.query.q) { where += ' AND (p.title LIKE ? OR p.author_email LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }

  const page = Math.max(1, parseInt(String(req.query.page || '1')));
  const size = Math.min(100, Math.max(1, parseInt(String(req.query.size || '15'))));
  const offset = (page - 1) * size;
  const [cnt] = await pool.execute<any[]>(`SELECT COUNT(*) total FROM consult_posts p ${where}`, params);
  const [data] = await pool.execute<any[]>(
    `SELECT p.id, p.title, p.author_email, p.hospital_patient_id, p.status,
            p.assigned_doctor_id, p.handling_manager_id, p.conversation_id,
            d.name AS doctor_name, m.name AS manager_name,
            (SELECT cv.name FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
              WHERE c.advertiser_id=p.advertiser_id AND cv.email=p.author_email AND cv.name IS NOT NULL
              ORDER BY cv.visited_at DESC LIMIT 1) AS author_name,
            DATE_FORMAT(p.created_at,'%Y-%m-%d %H:%i') AS created_at,
            (SELECT COUNT(*) FROM consult_answers ca WHERE ca.post_id=p.id AND ca.is_deleted=0) AS answer_count
       FROM consult_posts p
       LEFT JOIN doctors d ON d.id=p.assigned_doctor_id
       LEFT JOIN managers m ON m.id=p.handling_manager_id
       ${where} ORDER BY p.created_at DESC LIMIT ${size} OFFSET ${offset}`,
    params
  );
  res.json({ ok: true, data, total: cnt[0].total });
});

// ── 게시글 상세 + 답변 ──────────────────────────────────────
router.get('/posts/:id', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT p.*, d.name AS doctor_name, m.name AS manager_name, cc.customer_lang
       FROM consult_posts p
       LEFT JOIN doctors d ON d.id=p.assigned_doctor_id
       LEFT JOIN managers m ON m.id=p.handling_manager_id
       LEFT JOIN chat_conversations cc ON cc.id=p.conversation_id
      WHERE p.id=? AND p.advertiser_id=? AND p.is_deleted=0`, [id, a]);
  if (!rows.length) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });
  const post = rows[0];
  if (sessRole(req) === 'doctor' && post.assigned_doctor_id !== sessId(req)) {
    return res.status(403).json({ error: '배정된 상담만 볼 수 있습니다.' });
  }
  delete post.password_hash;
  const [answers] = await pool.execute<any[]>(
    `SELECT a.id, a.author_type, a.author_id, a.body, a.chat_link_token,
            DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') AS created_at,
            CASE WHEN a.author_type='doctor' THEN d.name ELSE m.name END AS author_name
       FROM consult_answers a
       LEFT JOIN doctors d ON d.id=a.author_id AND a.author_type='doctor'
       LEFT JOIN managers m ON m.id=a.author_id AND a.author_type='manager'
      WHERE a.post_id=? AND a.is_deleted=0 ORDER BY a.created_at`, [id]);
  res.json({ ok: true, post, answers });
});

// ── 고객 이력 (방문/결제/예약) ──────────────────────────────
router.get('/posts/:id/history', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [pr] = await pool.execute<any[]>(
    'SELECT author_email, hospital_patient_id, customer_id FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0', [id, a]);
  if (!pr.length) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });
  const { author_email, hospital_patient_id, customer_id } = pr[0];

  const [visits] = await pool.execute<any[]>(
    `SELECT cv.id, cv.name, cv.hospital_patient_id, cv.nationality, cv.visit_type,
            cv.payment_amount, DATE_FORMAT(cv.treated_at,'%Y-%m-%d') AS treated_at,
            cv.campaign_id, d.name AS doctor_name, m.name AS manager_name
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
       LEFT JOIN doctors d ON d.id=cv.doctor_id
       LEFT JOIN managers m ON m.id=cv.manager_id
      WHERE c.advertiser_id=? AND (cv.email=? OR (? IS NOT NULL AND cv.hospital_patient_id=?))
      ORDER BY cv.visited_at DESC LIMIT 100`,
    [a, author_email, hospital_patient_id, hospital_patient_id]);

  let appts: any[] = [];
  if (customer_id) {
    const [ap] = await pool.execute<any[]>(
      `SELECT ap.status, DATE_FORMAT(ap.start_at,'%Y-%m-%d %H:%i') AS start_at,
              DATE_FORMAT(ap.end_at,'%H:%i') AS end_at, d.name AS doctor_name
         FROM appointments ap LEFT JOIN doctors d ON d.id=ap.doctor_id
        WHERE ap.advertiser_id=? AND ap.customer_id=? AND ap.is_deleted=0
        ORDER BY ap.start_at DESC LIMIT 50`, [a, customer_id]);
    appts = ap;
  }
  res.json({ ok: true, email: author_email, hospital_patient_id, visits, appointments: appts });
});

// 상담 원문/답변 번역 미리보기
router.post('/posts/:id/translate', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT p.id, p.title, p.body, p.lang, p.author_email, p.assigned_doctor_id,
            p.conversation_id, cc.customer_lang
       FROM consult_posts p
       LEFT JOIN chat_conversations cc ON cc.id=p.conversation_id
      WHERE p.id=? AND p.advertiser_id=? AND p.is_deleted=0`, [id, a]);
  if (!rows.length) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });
  const post = rows[0];
  if (sessRole(req) === 'doctor' && post.assigned_doctor_id !== sessId(req)) {
    return res.status(403).json({ error: '배정된 상담만 볼 수 있습니다.' });
  }
  const actorType = sessRole(req) === 'doctor' ? 'doctor' : sessRole(req) === 'manager' ? 'manager' : 'advertiser';
  const ctx = { advertiserId: a, conversationId: post.conversation_id || undefined,
    actorType: actorType as 'doctor' | 'manager' | 'advertiser', actorId: sessId(req) || null,
    customerEmail: post.author_email };
  const mode = String(req.body.mode || 'request');
  if (mode === 'answer') {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: '번역할 답변을 입력하세요.' });
    const targetLang = String(post.customer_lang || post.lang || 'en').toLowerCase().slice(0, 8);
    const result = await translate(text, targetLang, ctx);
    if (!result.translatedText && String(result.detectedLang || '').slice(0, 2) !== targetLang.slice(0, 2)) {
      return res.status(502).json({ error: '답변 번역에 실패했습니다. 잠시 후 다시 시도하세요.' });
    }
    return res.json({ ok: true, target_lang: targetLang, translated_text: result.translatedText || text });
  }
  const [titleResult, bodyResult] = await Promise.all([
    translate(String(post.title || ''), 'ko', ctx),
    translate(String(post.body || ''), 'ko', ctx),
  ]);
  const sourceLang = bodyResult.detectedLang || post.customer_lang || post.lang || null;
  if (!bodyResult.translatedText && String(sourceLang || '').slice(0, 2) !== 'ko') {
    return res.status(502).json({ error: '상담내용 번역에 실패했습니다. 잠시 후 다시 시도하세요.' });
  }
  res.json({ ok: true, source_lang: sourceLang,
    title: titleResult.translatedText || post.title, body: bodyResult.translatedText || post.body });
});

// ── 처리 배정 (담당자 처리 / 의사 지정) ─────────────────────
router.post('/posts/:id/assign', scheduler, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const handle = req.body.handle; // 'manager' | 'doctor' | 'both'
  const doctorId = req.body.doctor_id ? parseInt(req.body.doctor_id) : null;
  const [pr] = await pool.execute<any[]>('SELECT id FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0', [id, a]);
  if (!pr.length) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });

  const sets: string[] = ['status=?']; const vals: any[] = ['assigned'];
  if (handle === 'manager' || handle === 'both') {
    // 처리 담당자 = 현재 담당자(매니저) 또는 광고주
    const mid = sessRole(req) === 'manager' ? sessId(req) : (req.body.manager_id ? parseInt(req.body.manager_id) : null);
    sets.push('handling_manager_id=?'); vals.push(mid);
  }
  if (handle === 'doctor' || handle === 'both') {
    if (!doctorId) return res.status(400).json({ error: '지정할 의사를 선택하세요.' });
    const [dr] = await pool.execute<any[]>('SELECT id FROM doctors WHERE id=? AND advertiser_id=? AND is_deleted=0', [doctorId, a]);
    if (!dr.length) return res.status(400).json({ error: '의사를 찾을 수 없습니다.' });
    sets.push('assigned_doctor_id=?'); vals.push(doctorId);
  }
  vals.push(id, a);
  await pool.execute(`UPDATE consult_posts SET ${sets.join(', ')} WHERE id=? AND advertiser_id=?`, vals);
  res.json({ ok: true });
});

// 대화방 확보 (없으면 생성 + 게시글 링크)
async function ensureConversation(a: number, post: any): Promise<number> {
  if (post.conversation_id) return post.conversation_id;
  const [r]: any = await pool.execute(
    `INSERT INTO chat_conversations (advertiser_id, post_id, customer_email, customer_id, hospital_patient_id)
     VALUES (?,?,?,?,?)`,
    [a, post.id, post.author_email, post.customer_id, post.hospital_patient_id]);
  const convId = r.insertId;
  await pool.execute('UPDATE consult_posts SET conversation_id=? WHERE id=?', [convId, post.id]);
  return convId;
}

// ── 답변 작성 (담당자/의사 둘 다 가능) → 채팅링크 메일 ───────
router.post('/posts/:id/answer', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  let body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: '답변 내용을 입력하세요.' });
  const role = sessRole(req);
  const authorType = role === 'doctor' ? 'doctor' : 'manager';

  const [pr] = await pool.execute<any[]>('SELECT * FROM consult_posts WHERE id=? AND advertiser_id=? AND is_deleted=0', [id, a]);
  if (!pr.length) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });
  const post = pr[0];
  const authorId = role === 'advertiser' ? (post.handling_manager_id || 0) : sessId(req);
  if (role === 'doctor' && post.assigned_doctor_id !== sessId(req)) {
    return res.status(403).json({ error: '배정된 상담에만 답변할 수 있습니다.' });
  }

  const convId = await ensureConversation(a, post);
  let translatedFromKo = false;
  let answerLang = 'ko';
  if (req.body.translate_to_customer) {
    const [langRows] = await pool.execute<any[]>(
      'SELECT customer_lang FROM chat_conversations WHERE id=? AND advertiser_id=?', [convId, a]);
    answerLang = String(langRows[0]?.customer_lang || post.lang || 'en').toLowerCase().slice(0, 8);
    if (answerLang !== 'ko') {
      const result = await translate(body, answerLang, {
        advertiserId: a, conversationId: convId,
        actorType: (role === 'doctor' ? 'doctor' : role === 'manager' ? 'manager' : 'advertiser') as any,
        actorId: sessId(req) || null, customerEmail: post.author_email,
      });
      if (!result.translatedText && String(result.detectedLang || '').slice(0, 2) !== answerLang.slice(0, 2)) {
        return res.status(502).json({ error: '답변 번역에 실패하여 등록하지 않았습니다. 잠시 후 다시 시도하세요.' });
      }
      if (result.translatedText) { body = result.translatedText; translatedFromKo = true; }
    }
  }
  // 스탭 참가자 등록
  const dispName = sessName(req) || (authorType === 'doctor' ? '의사' : '담당자');
  await pool.execute(
    `INSERT IGNORE INTO chat_participants (conversation_id, advertiser_id, participant_type, participant_id, display_name, lang)
     VALUES (?,?,?,?,?, 'ko')`, [convId, a, authorType, authorId, dispName]);

  const chatToken = crypto.randomBytes(20).toString('hex');
  await pool.execute(
    'INSERT INTO consult_answers (advertiser_id, post_id, author_type, author_id, body, chat_link_token) VALUES (?,?,?,?,?,?)',
    [a, id, authorType, authorId, body, chatToken]);
  await pool.execute('UPDATE consult_posts SET status=?, answered_at=NOW() WHERE id=?', ['answered', id]);

  // 통보 메일 (비치명적)
  try {
    const base = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const [chatLangRows] = await pool.execute<any[]>('SELECT customer_lang FROM chat_conversations WHERE id=?', [convId]);
    const chatLang = ['ko', 'th'].includes(String(chatLangRows[0]?.customer_lang || '').toLowerCase()) ? String(chatLangRows[0].customer_lang).toLowerCase() : 'en';
    const chat_url = `${base}/consult-chat?h=${a}&p=${id}&t=${chatToken}&lang=${encodeURIComponent(chatLang)}`;
    const [adv0] = await pool.execute<any[]>('SELECT company_name FROM advertisers WHERE id=?', [a]);
    await sendEmail({
      templateKey: 'consult_answered', to: post.author_email,
      vars: { name: '고객', title: post.title, hospital_name: adv0[0]?.company_name || '병원', chat_url },
      advertiserId: a,
    });
  } catch (e) { console.error('[consult] 답변 메일 실패', (e as any)?.message); }

  res.json({ ok: true, conversation_id: convId, translated: translatedFromKo, answer_lang: answerLang });
});

// ── 상담 종결 ───────────────────────────────────────────────
router.post('/posts/:id/close', scheduler, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [r]: any = await pool.execute('UPDATE consult_posts SET status=? WHERE id=? AND advertiser_id=? AND is_deleted=0', ['closed', id, a]);
  if (!r.affectedRows) return res.status(404).json({ error: '상담글을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// ── 대화 목록 (채팅 콘솔) ───────────────────────────────────
router.get('/conversations', viewer, async (req: Request, res: Response) => {
  const a = adv(req);
  let where = 'WHERE cc.advertiser_id=?';
  const params: any[] = [a];
  if (sessRole(req) === 'doctor') {
    where += ` AND EXISTS (SELECT 1 FROM chat_participants cp WHERE cp.conversation_id=cc.id AND cp.participant_type='doctor' AND cp.participant_id=?)`;
    params.push(sessId(req));
  }
  const [rows] = await pool.execute<any[]>(
    `SELECT cc.id, cc.customer_email, cc.hospital_patient_id, cc.status, cc.post_id,
            DATE_FORMAT(cc.last_message_at,'%Y-%m-%d %H:%i') AS last_message_at,
            p.title AS post_title,
            DATE_FORMAT(COALESCE(p.created_at, cc.created_at),'%Y-%m-%d') AS registered_at,
            (SELECT original_text FROM chat_messages m WHERE m.conversation_id=cc.id ORDER BY m.id DESC LIMIT 1) AS last_text,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id=cc.id) AS msg_count
       FROM chat_conversations cc
       LEFT JOIN consult_posts p ON p.id=cc.post_id
       ${where} ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC LIMIT 200`, params);
  res.json({ ok: true, data: rows });
});

// ── 대화 메시지 히스토리 ────────────────────────────────────
router.get('/conversations/:id/messages', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [cc] = await pool.execute<any[]>('SELECT id FROM chat_conversations WHERE id=? AND advertiser_id=?', [id, a]);
  if (!cc.length) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  const [rows] = await pool.execute<any[]>(
    `SELECT m.id, m.sender_type, m.sender_id, m.original_text, m.original_lang,
            m.translated_text, m.translated_lang, m.attachment_id,
            DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i') AS created_at,
            att.original_name, att.file_path, att.mime_type
       FROM chat_messages m LEFT JOIN chat_attachments att ON att.id=m.attachment_id
      WHERE m.conversation_id=? ORDER BY m.id`, [id]);
  res.json({ ok: true, data: rows });
});

// ── 대화 상대 고객 정보 (기본정보 + 의료기록) ──────────────
router.get('/conversations/:id/customer', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const id = parseInt(req.params.id);
  const [cc] = await pool.execute<any[]>(
    'SELECT id, customer_email, hospital_patient_id, customer_id FROM chat_conversations WHERE id=? AND advertiser_id=?', [id, a]);
  if (!cc.length) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  // 의사는 참여한 대화만
  if (sessRole(req) === 'doctor') {
    const [p] = await pool.execute<any[]>(
      "SELECT 1 FROM chat_participants WHERE conversation_id=? AND participant_type='doctor' AND participant_id=?", [id, sessId(req)]);
    if (!p.length) return res.status(403).json({ error: '참여한 대화만 볼 수 있습니다.' });
  }
  const conv = cc[0];
  const email = conv.customer_email;
  const hpid = conv.hospital_patient_id;

  const [basicRows] = await pool.execute<any[]>(
    `SELECT cv.name, cv.email, cv.mobile, cv.nationality, cv.gender, cv.birth_ymd, cv.hospital_patient_id
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
      WHERE c.advertiser_id=? AND cv.email=? ORDER BY cv.visited_at DESC LIMIT 1`, [a, email]);

  const [visits] = await pool.execute<any[]>(
    `SELECT cv.name, cv.visit_type, cv.payment_amount,
            DATE_FORMAT(cv.treated_at,'%Y-%m-%d') AS treated_at,
            d.name AS doctor_name, m.name AS manager_name
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
       LEFT JOIN doctors d ON d.id=cv.doctor_id
       LEFT JOIN managers m ON m.id=cv.manager_id
      WHERE c.advertiser_id=? AND (cv.email=? OR (? IS NOT NULL AND cv.hospital_patient_id=?))
      ORDER BY cv.visited_at DESC LIMIT 100`, [a, email, hpid, hpid]);

  let appts: any[] = [];
  if (conv.customer_id) {
    const [ap] = await pool.execute<any[]>(
      `SELECT ap.status, DATE_FORMAT(ap.start_at,'%Y-%m-%d %H:%i') AS start_at,
              DATE_FORMAT(ap.end_at,'%H:%i') AS end_at, d.name AS doctor_name
         FROM appointments ap LEFT JOIN doctors d ON d.id=ap.doctor_id
        WHERE ap.advertiser_id=? AND ap.customer_id=? AND ap.is_deleted=0
        ORDER BY ap.start_at DESC LIMIT 50`, [a, conv.customer_id]);
    appts = ap;
  }
  res.json({
    ok: true, registered: basicRows.length > 0,
    basic: basicRows[0] || { email }, hospital_patient_id: hpid,
    visits, appointments: appts,
  });
});

// ── 담당자 발신 채팅 시작 (고객 선택) ───────────────────────
router.post('/conversations/open', scheduler, async (req: Request, res: Response) => {
  const a = adv(req);
  const email = String(req.body.email || '').trim();
  const visitId = req.body.visit_id ? parseInt(req.body.visit_id) : null;
  if (!email) return res.status(400).json({ error: '고객 이메일이 필요합니다.' });
  // 기존 열린 대화 재사용
  const [ex] = await pool.execute<any[]>(
    "SELECT id FROM chat_conversations WHERE advertiser_id=? AND customer_email=? AND status='open' ORDER BY id DESC LIMIT 1", [a, email]);
  let convId: number;
  let hpid: string | null = null;
  const [cv] = await pool.execute<any[]>(
    `SELECT cv.hospital_patient_id, cv.id FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
      WHERE c.advertiser_id=? AND cv.email=? ORDER BY cv.visited_at DESC LIMIT 1`, [a, email]);
  if (cv.length) hpid = cv[0].hospital_patient_id;
  if (ex.length) { convId = ex[0].id; }
  else {
    const [r]: any = await pool.execute(
      'INSERT INTO chat_conversations (advertiser_id, customer_email, hospital_patient_id) VALUES (?,?,?)', [a, email, hpid]);
    convId = r.insertId;
  }
  const role = sessRole(req); const authorType = role === 'doctor' ? 'doctor' : 'manager';
  await pool.execute(
    `INSERT IGNORE INTO chat_participants (conversation_id, advertiser_id, participant_type, participant_id, display_name, lang)
     VALUES (?,?,?,?,?, 'ko')`, [convId, a, authorType, sessId(req), sessName(req) || '담당자']);
  res.json({ ok: true, conversation_id: convId });
});

// ── 채팅 파일 업로드 (스탭) ─────────────────────────────────
router.post('/conversations/:id/upload', viewer, chatUpload, async (req: Request, res: Response) => {
  const a = adv(req); const cid = parseInt(req.params.id);
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  const [cc] = await pool.execute<any[]>('SELECT id FROM chat_conversations WHERE id=? AND advertiser_id=?', [cid, a]);
  if (!cc.length) return res.status(404).json({ error: '대화를 찾을 수 없습니다.' });
  const role = sessRole(req); const uploaderType = role === 'doctor' ? 'doctor' : 'manager';
  const rel = `uploads/active/${a}/chat/${req.file.filename}`;
  const [att]: any = await pool.execute(
    `INSERT INTO chat_attachments (advertiser_id, conversation_id, uploader_type, uploader_id, file_path, original_name, mime_type, size_bytes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [a, cid, uploaderType, sessId(req), rel, req.file.originalname, req.file.mimetype, req.file.size]);
  const [msg]: any = await pool.execute(
    `INSERT INTO chat_messages (advertiser_id, conversation_id, sender_type, sender_id, attachment_id) VALUES (?,?,?,?,?)`,
    [a, cid, uploaderType, sessId(req), att.insertId]);
  await pool.execute('UPDATE chat_conversations SET last_message_at=NOW() WHERE id=?', [cid]);
  const payload = {
    id: msg.insertId, conversation_id: cid, sender_type: uploaderType, sender_id: sessId(req),
    original_text: null, attachment: { id: att.insertId, name: req.file.originalname, path: '/' + rel, mime: req.file.mimetype },
    unread: 1,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  await appendChatTrainingLog({
    event: 'attachment_created',
    advertiserId: a,
    conversationId: cid,
    messageId: msg.insertId,
    senderType: uploaderType,
    senderId: sessId(req),
    attachment: { id: att.insertId, name: req.file.originalname, path: '/' + rel, mime: req.file.mimetype },
  });
  const io = req.app.get('io'); if (io) broadcastAttachment(io, a, cid, payload);
  res.json({ ok: true });
});

// ── LLM 시스템 채팅 ─────────────────────────────────────────
router.post('/system-chat', viewer, async (req: Request, res: Response) => {
  const a = adv(req); const role = sessRole(req);
  const msgs = Array.isArray(req.body.messages) ? req.body.messages : [];
  if (!msgs.length) return res.status(400).json({ error: '메시지가 필요합니다.' });
  // 사용자 메시지만 안전하게 추림(role/text)
  const clean = msgs.slice(-20).map((m: any) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000),
  })).filter((m: any) => m.content);
  if (!clean.length || clean[clean.length - 1].role !== 'user') {
    return res.status(400).json({ error: '마지막 메시지는 사용자 입력이어야 합니다.' });
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    const out = await systemChat(a, { type: role === 'doctor' ? 'doctor' : (role === 'manager' ? 'manager' : 'advertiser'), id: sessId(req) }, null, clean, today);
    res.json({ ok: true, answer: out.answer });
  } catch (e) { console.error('[consult] system-chat', (e as any)?.message); res.status(500).json({ error: 'LLM 처리에 실패했습니다.' }); }
});

export default router;
