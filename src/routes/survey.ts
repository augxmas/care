import { Router, Request, Response } from 'express';
import path from 'path';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { uploadSurveyImage } from '../middleware/upload';

const router = Router();

// 수집 가능한 개인정보 항목 화이트리스트 (customer_visits 컬럼명과 일치)
const PERSONAL_FIELDS_ALLOWED = [
  'name', 'pronunciation_ko', 'mobile', 'phone', 'birth_ymd', 'gender',
  'nationality', 'address', 'postal_code', 'job', 'company', 'sns',
];

function sanitizeFields(input: any): string[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  return arr.map((s: any) => String(s).trim()).filter((s: string) => PERSONAL_FIELDS_ALLOWED.includes(s));
}

// 이미지 업로드 — 저장 전에 호출, 경로/이름만 반환
router.post('/upload-image', requireAdvertiser, uploadSurveyImage.single('image'),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    const rel = '/uploads/active/' + path.relative(
      path.join(process.cwd(), 'uploads', 'active'),
      req.file.path
    ).replace(/\\/g, '/');
    res.json({ ok: true, path: rel, name: req.file.originalname });
  }
);

// ──────────────────────────────────────────────────────────────
// 고객별 — 문진 제출 고객 목록 + 상세 (탭 두 번째)
// ──────────────────────────────────────────────────────────────

// 고객 목록 (이메일별 그룹)
router.get('/customers', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { keyword, page = 1, size = 10 } = req.query;
  let where = 'WHERE ss.advertiser_id = ? AND ss.email IS NOT NULL';
  const params: any[] = [adv.id];
  if (keyword) {
    where += ' AND ss.email LIKE ?';
    params.push(`%${keyword}%`);
  }

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(DISTINCT ss.email) AS total FROM survey_submissions ss ${where}`,
    params
  );
  const total = countRows[0].total;

  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [data] = await pool.execute<any[]>(
    `SELECT
       ss.email,
       COUNT(*) AS submission_count,
       MAX(ss.submitted_at) AS last_submitted_at,
       (SELECT cv.name FROM customer_visits cv
          INNER JOIN campaigns c ON c.id = cv.campaign_id
          WHERE cv.email = ss.email AND c.advertiser_id = ss.advertiser_id AND cv.name IS NOT NULL
          ORDER BY cv.visited_at DESC LIMIT 1) AS name,
       (SELECT cv.mobile FROM customer_visits cv
          INNER JOIN campaigns c ON c.id = cv.campaign_id
          WHERE cv.email = ss.email AND c.advertiser_id = ss.advertiser_id AND cv.mobile IS NOT NULL
          ORDER BY cv.visited_at DESC LIMIT 1) AS mobile,
       (SELECT cv.user_id FROM customer_visits cv
          INNER JOIN campaigns c ON c.id = cv.campaign_id
          WHERE cv.email = ss.email AND c.advertiser_id = ss.advertiser_id AND cv.user_id IS NOT NULL
          ORDER BY cv.visited_at DESC LIMIT 1) AS user_id,
       (SELECT cv.hospital_patient_id FROM customer_visits cv
          INNER JOIN campaigns c ON c.id = cv.campaign_id
          WHERE cv.email = ss.email AND c.advertiser_id = ss.advertiser_id AND cv.hospital_patient_id IS NOT NULL
          ORDER BY cv.visited_at DESC LIMIT 1) AS hospital_patient_id
     FROM survey_submissions ss
     ${where}
     GROUP BY ss.email
     ORDER BY MAX(ss.submitted_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
});

// 특정 고객(이메일)의 제출 이력
router.get('/customers/:email/submissions', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT ss.id, ss.survey_id, s.title AS survey_title,
            s.categories AS survey_categories,
            ss.submitted_at, ss.personal_data,
            ss.note, ss.note_updated_at, ss.note_updated_by
       FROM survey_submissions ss
       INNER JOIN surveys s ON s.id = ss.survey_id
       WHERE ss.advertiser_id = ? AND ss.email = ?
       ORDER BY ss.submitted_at DESC`,
    [adv.id, req.params.email]
  );
  rows.forEach((r: any) => {
    try { r.personal_data = r.personal_data ? JSON.parse(r.personal_data) : {}; } catch { r.personal_data = {}; }
  });
  res.json({ ok: true, data: rows });
});

// 단일 제출 상세 (질문 + 답변)
router.get('/submissions/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT ss.id, ss.survey_id, ss.email, ss.personal_data, ss.answers,
            ss.matched_visit_id, ss.ip, ss.submitted_at,
            ss.note, ss.note_updated_at, ss.note_updated_by,
            s.title AS survey_title, s.image_path AS survey_image,
            s.questions AS survey_questions,
            s.personal_fields, s.collects_personal_info
       FROM survey_submissions ss
       INNER JOIN surveys s ON s.id = ss.survey_id
       WHERE ss.id = ? AND ss.advertiser_id = ?`,
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '제출 내역을 찾을 수 없습니다.' });
  const r: any = rows[0];
  try { r.answers          = r.answers          ? JSON.parse(r.answers)          : []; } catch { r.answers = []; }
  try { r.personal_data    = r.personal_data    ? JSON.parse(r.personal_data)    : {}; } catch { r.personal_data = {}; }
  try { r.survey_questions = r.survey_questions ? JSON.parse(r.survey_questions) : []; } catch { r.survey_questions = []; }
  res.json({ ok: true, submission: r });
});

// 제출 노트 저장 (의사/담당자가 남기는 메모)
router.put('/submissions/:id/note', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const note = (req.body && req.body.note != null) ? String(req.body.note).slice(0, 2000) : null;
  const actor = getActor(req);
  const [result]: any = await pool.execute(
    `UPDATE survey_submissions
       SET note = ?, note_updated_at = NOW(), note_updated_by = ?
       WHERE id = ? AND advertiser_id = ?`,
    [note, actor, req.params.id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '제출 내역을 찾을 수 없습니다.' });
  const [rows] = await pool.execute<any[]>(
    `SELECT note, note_updated_at, note_updated_by FROM survey_submissions WHERE id = ?`,
    [req.params.id]
  );
  res.json({ ok: true, ...rows[0] });
});

// 목록
router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { keyword, title, category, status, page = 1, size = 10 } = req.query;
  let where = 'WHERE advertiser_id = ? AND is_deleted = 0';
  const params: any[] = [adv.id];
  if (keyword) {  // 통합 검색(하위호환)
    where += ' AND (title LIKE ? OR categories LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (title)    { where += ' AND title LIKE ?';      params.push(`%${title}%`); }
  if (category) { where += ' AND categories LIKE ?'; params.push(`%${category}%`); }
  if (status === 'draft' || status === 'active' || status === 'inactive') {
    where += ' AND status = ?';
    params.push(status);
  }
  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM surveys ${where}`, params);
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT id, title, categories, image_path, image_name,
            collects_personal_info, personal_fields,
            questions, status, created_at, updated_at
       FROM surveys ${where}
       ORDER BY FIELD(status,'draft','active','inactive'), updated_at DESC, created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  data.forEach((r: any) => {
    try { r.questions = r.questions ? JSON.parse(r.questions) : []; } catch { r.questions = []; }
    r.question_count = Array.isArray(r.questions) ? r.questions.length : 0;
  });
  res.json({ ok: true, data, total });
});

// ── 문진 대시보드 통계 ──────────────────────────────────────
// 고객/환자는 이메일(사람) 단위. 환자 = 병원ID 보유.
router.get('/dashboard-stats', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser.id;

  // 1) 문진 개수 (활성/비활성/임시)
  const [sc] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status='active'),0)   AS active,
            COALESCE(SUM(status='inactive'),0) AS inactive,
            COALESCE(SUM(status='draft'),0)    AS draft
       FROM surveys WHERE advertiser_id=? AND is_deleted=0`, [adv]);

  // 2) 전체 고객(이메일 단위)
  const [tc] = await pool.execute<any[]>(
    `SELECT COUNT(DISTINCT cv.email) AS n
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
      WHERE c.advertiser_id=? AND cv.email IS NOT NULL AND cv.email<>''`, [adv]);

  // 3) 문진 작성 고객 수 + 그 중 환자 수
  const [scp] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS survey_customers,
            COALESCE(SUM(is_patient),0) AS survey_customer_patients
       FROM (
         SELECT cv.email,
                MAX(cv.hospital_patient_id IS NOT NULL AND cv.hospital_patient_id<>'') AS is_patient
           FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
          WHERE c.advertiser_id=? AND cv.email IS NOT NULL AND cv.email<>''
            AND cv.email IN (SELECT ss.email FROM survey_submissions ss WHERE ss.advertiser_id=? AND ss.email IS NOT NULL)
          GROUP BY cv.email
       ) t`, [adv, adv]);

  // 4) 최다 응답 문진
  const [topResp] = await pool.execute<any[]>(
    `SELECT s.title, COUNT(ss.id) AS cnt
       FROM surveys s LEFT JOIN survey_submissions ss ON ss.survey_id=s.id
      WHERE s.advertiser_id=? AND s.is_deleted=0
      GROUP BY s.id HAVING cnt>0 ORDER BY cnt DESC LIMIT 1`, [adv]);

  // 5) 최고 전환율 문진 (응답 고객 중 환자 비율)
  const [topConv] = await pool.execute<any[]>(
    `SELECT * FROM (
       SELECT s.title,
              COUNT(DISTINCT ss.email) AS submitters,
              COUNT(DISTINCT CASE WHEN p.email IS NOT NULL THEN ss.email END) AS patient_submitters
         FROM surveys s
         INNER JOIN survey_submissions ss ON ss.survey_id=s.id AND ss.email IS NOT NULL
         LEFT JOIN (
           SELECT DISTINCT cv.email FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
            WHERE c.advertiser_id=? AND cv.hospital_patient_id IS NOT NULL AND cv.hospital_patient_id<>''
         ) p ON p.email=ss.email
        WHERE s.advertiser_id=? AND s.is_deleted=0
        GROUP BY s.id HAVING submitters>0
     ) t
     ORDER BY (t.patient_submitters / t.submitters) DESC, t.submitters DESC LIMIT 1`, [adv, adv]);

  const tcr = topConv[0];
  res.json({
    ok: true,
    surveys: {
      total: Number(sc[0].total), active: Number(sc[0].active),
      inactive: Number(sc[0].inactive), draft: Number(sc[0].draft),
    },
    total_customers: Number(tc[0].n),
    survey_customers: Number(scp[0].survey_customers),
    survey_customer_patients: Number(scp[0].survey_customer_patients),
    top_response: topResp.length ? { title: topResp[0].title, count: Number(topResp[0].cnt) } : null,
    top_conversion: tcr ? {
      title: tcr.title, submitters: Number(tcr.submitters), patients: Number(tcr.patient_submitters),
      rate: Number(tcr.submitters) > 0 ? Math.round(Number(tcr.patient_submitters) / Number(tcr.submitters) * 1000) / 10 : 0,
    } : null,
  });
});

// 단건
router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM surveys WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });
  const survey = rows[0];
  try { survey.questions = survey.questions ? JSON.parse(survey.questions) : []; } catch { survey.questions = []; }
  const [scnt] = await pool.execute<any[]>(
    'SELECT COUNT(*) AS n FROM survey_submissions WHERE survey_id = ?', [req.params.id]);
  survey.submission_count = scnt[0].n;
  res.json({ ok: true, survey });
});

function normalizeStatus(s: any): 'draft'|'active'|'inactive' {
  if (s === 'draft' || s === 'active' || s === 'inactive') return s;
  return 'active';  // 기본
}

// 등록 (임시저장 / 활성화 / 비활성화)
router.post('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const {
    title, categories, questions, status,
    image_path, image_name,
    collects_personal_info, personal_fields,
    terms_text, privacy_text,
  } = req.body;
  const st = normalizeStatus(status);
  const isDraft = st === 'draft';
  if (!title || !String(title).trim()) return res.status(400).json({ error: '제목은 필수입니다.' });
  const cats = Array.isArray(categories) ? categories.join(',') : String(categories || '');
  const qArr = Array.isArray(questions) ? questions : [];
  if (!isDraft && !qArr.length) return res.status(400).json({ error: '질문을 1개 이상 추가해주세요.' });
  const cpi = collects_personal_info ? 1 : 0;
  const pf  = cpi ? sanitizeFields(personal_fields).join(',') : '';
  if (!isDraft && cpi && !pf) return res.status(400).json({ error: '개인정보 수집 항목을 1개 이상 선택해주세요.' });
  const [result]: any = await pool.execute(
    `INSERT INTO surveys
       (advertiser_id, title, categories, image_path, image_name,
        collects_personal_info, personal_fields, terms_text, privacy_text,
        questions, is_draft, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [adv.id, String(title).slice(0, 300), cats.slice(0, 500),
     image_path || null, image_name || null,
     cpi, pf || null, terms_text || null, privacy_text || null,
     JSON.stringify(qArr), isDraft ? 1 : 0, st]
  );
  res.json({ ok: true, id: result.insertId, status: st });
});

// 복제 — 선택한 문진과 동일한 문진 생성 (활성화된 문진만 가능)
router.post('/:id/duplicate', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM surveys WHERE id = ? AND advertiser_id = ? AND is_deleted = 0', [id, adv.id]);
  if (!rows.length) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });
  const s = rows[0];
  if (s.status !== 'active') return res.status(400).json({ error: '활성화된 문진만 복사할 수 있습니다.' });
  const newTitle = (String(s.title || '').slice(0, 294) + ' (복사)');
  const [result]: any = await pool.execute(
    `INSERT INTO surveys
       (advertiser_id, title, categories, image_path, image_name,
        collects_personal_info, personal_fields, terms_text, privacy_text,
        questions, is_draft, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [adv.id, newTitle, s.categories, s.image_path, s.image_name,
     s.collects_personal_info, s.personal_fields, s.terms_text, s.privacy_text,
     s.questions, 0, 'active']
  );
  res.json({ ok: true, id: result.insertId });
});

// 수정 (임시저장 / 활성화 / 비활성화)
router.put('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const {
    title, categories, questions, status,
    image_path, image_name,
    collects_personal_info, personal_fields,
    terms_text, privacy_text,
  } = req.body;
  const st = normalizeStatus(status);
  const isDraft = st === 'draft';
  if (!title || !String(title).trim()) return res.status(400).json({ error: '제목은 필수입니다.' });

  // 한 번 활성/비활성으로 승격된 문진은 다시 임시저장으로 못 돌아감
  if (isDraft) {
    const [cur] = await pool.execute<any[]>(
      `SELECT status FROM surveys WHERE id=? AND advertiser_id=? AND is_deleted=0`,
      [id, adv.id]
    );
    if (cur.length && cur[0].status !== 'draft') {
      return res.status(400).json({ error: '이미 활성/비활성으로 저장된 문진은 임시저장으로 되돌릴 수 없습니다.' });
    }
  }

  const cats = Array.isArray(categories) ? categories.join(',') : String(categories || '');
  const qArr = Array.isArray(questions) ? questions : [];
  if (!isDraft && !qArr.length) return res.status(400).json({ error: '질문을 1개 이상 추가해주세요.' });
  const cpi = collects_personal_info ? 1 : 0;
  const pf  = cpi ? sanitizeFields(personal_fields).join(',') : '';
  if (!isDraft && cpi && !pf) return res.status(400).json({ error: '개인정보 수집 항목을 1개 이상 선택해주세요.' });
  const [result]: any = await pool.execute(
    `UPDATE surveys SET
       title=?, categories=?, image_path=?, image_name=?,
       collects_personal_info=?, personal_fields=?,
       terms_text=?, privacy_text=?,
       questions=?, is_draft=?, status=?
     WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [String(title).slice(0, 300), cats.slice(0, 500),
     image_path || null, image_name || null,
     cpi, pf || null, terms_text || null, privacy_text || null,
     JSON.stringify(qArr), isDraft ? 1 : 0, st, id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });
  res.json({ ok: true, status: st });
});

// 삭제 (soft)
router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const actor = getActor(req);
  // 응답한 고객이 있으면 삭제 불가
  const [scnt] = await pool.execute<any[]>(
    'SELECT COUNT(*) AS n FROM survey_submissions WHERE survey_id = ?', [req.params.id]);
  if (scnt[0].n > 0) return res.status(400).json({ error: '응답한 고객이 있어 삭제할 수 없습니다.' });
  const [result]: any = await pool.execute(
    `UPDATE surveys SET is_deleted=1, deleted_at=NOW(), deleted_by=?
       WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [actor, req.params.id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '문진을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

export default router;
