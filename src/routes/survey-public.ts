import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { sendEmail } from '../services/email.service';

const router = Router();

// 수집 가능한 개인정보 항목 (survey.ts 와 동기화 필요)
const PERSONAL_FIELDS_ALLOWED = [
  'name', 'pronunciation_ko', 'mobile', 'phone', 'birth_ymd', 'gender',
  'nationality', 'address', 'postal_code', 'job', 'company', 'sns',
];

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function loadSurvey(id: string | number): Promise<any | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, advertiser_id, title, categories, image_path,
            collects_personal_info, personal_fields,
            terms_text, privacy_text, questions
       FROM surveys WHERE id=? AND is_deleted=0 AND status='active'`,
    [id]
  );
  if (!rows.length) return null;
  const s = rows[0];
  try { s.questions = s.questions ? JSON.parse(s.questions) : []; } catch { s.questions = []; }
  s.personal_fields = (s.personal_fields || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  return s;
}

// 공개: 문진 메타 조회
router.get('/:id', async (req: Request, res: Response) => {
  const s = await loadSurvey(req.params.id);
  if (!s) return res.status(404).json({ error: '문진을 찾을 수 없거나 등록되지 않았습니다.' });
  res.json({
    ok: true,
    survey: {
      id: s.id,
      title: s.title,
      categories: (s.categories || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      image_path: s.image_path,
      collects_personal_info: Number(s.collects_personal_info) === 1,
      personal_fields: s.personal_fields,
      terms_text:   s.terms_text,
      privacy_text: s.privacy_text,
      questions: s.questions,
    },
  });
});

// 공개: 이메일 인증코드 발송
router.post('/:id/send-code', async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
  }
  const s = await loadSurvey(req.params.id);
  if (!s) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });

  const code = genCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    `INSERT INTO email_verifications (email, code, expires_at) VALUES (?,?,?)`,
    [String(email), code, expiresAt]
  );

  try {
    await sendEmail({
      templateKey: 'email_verification',
      to: String(email),
      vars: { contact_name: '고객', code },
      advertiserId: s.advertiser_id,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: '인증코드 발송에 실패했습니다.' });
  }
});

// 공개: 인증코드 검증 + 회원 정보 prefill
router.post('/:id/verify-code', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: '이메일과 코드를 입력하세요.' });
  const s = await loadSurvey(req.params.id);
  if (!s) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });

  const [rows] = await pool.execute<any[]>(
    `SELECT id FROM email_verifications
       WHERE email = ? AND code = ? AND verified = 0 AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
    [String(email), String(code)]
  );
  if (!rows.length) return res.status(400).json({ error: '인증코드가 올바르지 않거나 만료되었습니다.' });
  await pool.execute(`UPDATE email_verifications SET verified=1 WHERE id=?`, [rows[0].id]);

  // 회원 매칭 — 같은 광고주 + 이메일 일치하는 최근 visit
  const fields = (s.personal_fields as string[]).filter(f => PERSONAL_FIELDS_ALLOWED.includes(f));
  let existing: any = null;
  let visitId: number | null = null;
  if (fields.length) {
    const selectCols = ['id', ...fields].join(', ');
    const [vrows] = await pool.execute<any[]>(
      `SELECT ${selectCols} FROM customer_visits cv
         INNER JOIN campaigns c ON c.id = cv.campaign_id
         WHERE cv.email = ? AND c.advertiser_id = ?
         ORDER BY cv.visited_at DESC LIMIT 1`,
      [String(email), s.advertiser_id]
    );
    if (vrows.length) {
      visitId = vrows[0].id;
      existing = {};
      fields.forEach(f => {
        const v = vrows[0][f];
        if (v !== null && v !== undefined && v !== '') existing[f] = v;
      });
    }
  }

  // 누락 항목 = 수집 항목 중 existing에 없는 것
  const missing = fields.filter(f => !existing || existing[f] === undefined);

  res.json({
    ok: true,
    email,
    isExisting: !!existing,
    visitId,
    existing: existing || {},
    missingFields: missing,
  });
});

// 공개: 최종 제출
router.post('/:id/submit', async (req: Request, res: Response) => {
  const { email, personal, answers, visitId } = req.body;
  const s = await loadSurvey(req.params.id);
  if (!s) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });

  // 개인정보가 필요한 문진은 이메일 인증 필수
  if (Number(s.collects_personal_info) === 1) {
    if (!email) return res.status(400).json({ error: '이메일 본인확인이 필요합니다.' });
    const [v] = await pool.execute<any[]>(
      `SELECT id FROM email_verifications
         WHERE email = ? AND verified = 1
         ORDER BY id DESC LIMIT 1`,
      [String(email)]
    );
    if (!v.length) return res.status(400).json({ error: '이메일 본인확인이 완료되지 않았습니다.' });
  }

  // personal_data sanitize — 화이트리스트 통과한 항목만
  const personalClean: any = {};
  if (personal && typeof personal === 'object') {
    for (const k of (s.personal_fields as string[])) {
      if (PERSONAL_FIELDS_ALLOWED.includes(k) && personal[k] !== undefined) {
        personalClean[k] = String(personal[k]).slice(0, 500);
      }
    }
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
           || req.socket.remoteAddress || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 500);

  await pool.execute(
    `INSERT INTO survey_submissions
       (survey_id, advertiser_id, email, personal_data, answers, matched_visit_id, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?)`,
    [s.id, s.advertiser_id, email || null,
     JSON.stringify(personalClean), JSON.stringify(answers || []),
     visitId || null, ip.slice(0, 45), ua]
  );

  res.json({ ok: true });
});

export default router;
