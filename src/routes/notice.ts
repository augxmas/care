import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { translateNotice } from '../services/llm.service';

const router = Router();
const NOTICE_LANGUAGES = ['ko', 'th', 'vi', 'ar', 'en', 'zh', 'ja'];

function normalizeLanguages(raw: any): string[] {
  const values = (Array.isArray(raw) ? raw : (raw ? [raw] : []))
    .flatMap((value: any) => String(value).split(','))
    .map((value: string) => value.trim().toLowerCase().split('-')[0])
    .filter((value: string, index: number, all: string[]) => NOTICE_LANGUAGES.includes(value) && all.indexOf(value) === index);
  return Array.from(new Set(['ko', ...values, 'en']));
}

function parseTranslations(raw: any): Record<string, { title: string; content: string }> {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

function localizedNotice(row: any, requested: any) {
  const translations = parseTranslations(row.translations);
  const requestedLanguages = String(requested || '').split(',').map(value => value.trim().toLowerCase().split('-')[0]).filter(Boolean);
  const lang = requestedLanguages.find(value => translations[value]) || (translations.en ? 'en' : 'ko');
  const selected: { title?: string; content?: string } = translations[lang] || translations.ko || {};
  return {
    ...row,
    original_title: row.title,
    original_content: row.content || '',
    title: selected.title || row.title,
    content: selected.content ?? row.content ?? '',
    selected_language: lang,
    supported_languages: normalizeLanguages(row.supported_languages),
    translations,
  };
}

function translationsFromBody(body: any, languages: string[], title: string, content: string) {
  const translations: Record<string, { title: string; content: string }> = { ko: { title, content } };
  for (const lang of languages.filter(value => value !== 'ko')) {
    const translatedTitle = String(body.translations?.[lang]?.title ?? body[`lang_notice_title_${lang}`] ?? '').trim();
    const translatedContent = String(body.translations?.[lang]?.content ?? body[`lang_notice_content_${lang}`] ?? '');
    if (translatedTitle || translatedContent) translations[lang] = { title: translatedTitle, content: translatedContent };
  }
  return translations;
}

// 목록
router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { keyword, page = 1, size = 10 } = req.query;
  let where = 'WHERE advertiser_id = ? AND is_deleted = 0';
  const params: any[] = [adv.id];
  if (keyword) { where += ' AND title LIKE ?'; params.push(`%${keyword}%`); }

  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM notices ${where}`, params);
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT id, title, content, supported_languages, translations, is_pinned, view_count, created_by, created_at, updated_at
       FROM notices ${where}
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data: data.map(row => localizedNotice(row, req.query.lang)), total });
});

// ── 공지 대시보드 통계 ──────────────────────────────────────
// 전체/금일/금주 공지 개수, 전체·평균 조회수
router.get('/stats', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT
       COUNT(*)                                                      AS total,
       COALESCE(SUM(DATE(created_at)=CURDATE()),0)                   AS today,
       COALESCE(SUM(YEARWEEK(created_at,1)=YEARWEEK(CURDATE(),1)),0) AS week,
       COALESCE(SUM(view_count),0)                                   AS total_views,
       COALESCE(ROUND(AVG(view_count),1),0)                          AS avg_views
     FROM notices WHERE advertiser_id=? AND is_deleted=0`, [adv.id]);
  const r: any = rows[0] || {};
  res.json({
    ok: true,
    total: Number(r.total) || 0,
    today: Number(r.today) || 0,
    week: Number(r.week) || 0,
    total_views: Number(r.total_views) || 0,
    avg_views: Number(r.avg_views) || 0,
  });
});

// 외부 공지 목록
router.get('/public-list/all', async (req: Request, res: Response) => {
  const advertiserId = Math.max(1, parseInt(String(req.query.advertiser_id || '3')) || 3);
  const [rows] = await pool.execute<any[]>(
    `SELECT id,title,content,supported_languages,translations,is_pinned,created_at,updated_at
       FROM notices WHERE advertiser_id=? AND is_deleted=0
       ORDER BY is_pinned DESC,created_at DESC LIMIT 100`,
    [advertiserId],
  );
  res.json({ ok: true, data: rows.map(row => {
    const notice = localizedNotice(row, req.query.lang);
    return { id: notice.id, title: notice.title, selected_language: notice.selected_language, is_pinned: notice.is_pinned, created_at: notice.created_at };
  }) });
});

// 외부 공지 팝업 조회 (브라우저 언어 우선, 미지원 언어는 영어 폴백)
router.get('/public/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_notice_id' });
  const [rows] = await pool.execute<any[]>(
    `SELECT id, title, content, supported_languages, translations, created_by, created_at, updated_at
       FROM notices WHERE id=? AND is_deleted=0`,
    [id],
  );
  if (!rows.length) return res.status(404).json({ error: 'notice_not_found' });
  await pool.execute('UPDATE notices SET view_count=view_count+1 WHERE id=?', [id]);
  const notice = localizedNotice(rows[0], req.query.lang);
  res.json({
    ok: true,
    notice: {
      id: notice.id,
      title: notice.title,
      content: notice.content,
      selected_language: notice.selected_language,
      supported_languages: notice.supported_languages,
      created_at: notice.created_at,
      updated_at: notice.updated_at,
    },
  });
});

// 단건 조회 (조회수 +1)
router.post('/translate', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiser = (req.session as any).advertiser;
  const user = (req.session as any).user || {};
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '');
  const languages = normalizeLanguages(req.body.languages);
  if (!title) return res.status(400).json({ error: '한국어 공지 제목을 입력하세요.' });
  if (!/[가-힣]/.test(`${title} ${content.replace(/<[^>]*>/g, ' ')}`)) return res.status(400).json({ error: '공지 제목과 내용은 한국어로 작성하세요.' });
  const translations: Record<string, any> = { ko: { title, content } };
  for (const lang of languages.filter(value => value !== 'ko')) {
    const result = await translateNotice(title, content, lang, {
      advertiserId: advertiser.id,
      actorType: user.role || 'advertiser',
      actorId: user.id || advertiser.id,
    });
    if (!result) return res.status(502).json({ error: `${lang} 번역을 생성하지 못했습니다. ANTHROPIC_API_KEY와 모델 설정을 확인하세요.` });
    translations[lang] = result;
  }
  res.json({ ok: true, data: translations });
});

router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM notices WHERE id = ? AND advertiser_id = ? AND is_deleted = 0`,
    [id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  await pool.execute(`UPDATE notices SET view_count = view_count + 1 WHERE id = ?`, [id]);
  res.json({ ok: true, notice: localizedNotice(rows[0], req.query.lang) });
});

// 작성
router.post('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { title, content, is_pinned } = req.body;
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  const languages = normalizeLanguages(req.body.supported_languages);
  const translations = translationsFromBody(req.body, languages, String(title).trim(), String(content || ''));
  const [result]: any = await pool.execute(
    `INSERT INTO notices (advertiser_id, title, content, supported_languages, translations, is_pinned, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [adv.id, String(title).slice(0, 300), content || '', languages.join(','), JSON.stringify(translations), is_pinned ? 1 : 0, adv.contact_name || '']
  );
  res.json({ ok: true, id: result.insertId });
});

// 수정
router.put('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const { title, content, is_pinned } = req.body;
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  const languages = normalizeLanguages(req.body.supported_languages);
  const translations = translationsFromBody(req.body, languages, String(title).trim(), String(content || ''));
  const [result]: any = await pool.execute(
    `UPDATE notices SET title = ?, content = ?, supported_languages = ?, translations = ?, is_pinned = ? WHERE id = ? AND advertiser_id = ? AND is_deleted = 0`,
    [String(title).slice(0, 300), content || '', languages.join(','), JSON.stringify(translations), is_pinned ? 1 : 0, id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// 삭제 (soft delete)
router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const actor = getActor(req);
  const [result]: any = await pool.execute(
    `UPDATE notices SET is_deleted=1, deleted_at=NOW(), deleted_by=?
       WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [actor, req.params.id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  res.json({ ok: true });
});

export default router;
