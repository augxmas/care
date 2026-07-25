import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';

const router = Router();

const VIDEO_TYPES = ['content', 'short'] as const;
type VideoType = typeof VIDEO_TYPES[number];

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?#]+)/,
    /youtube\.com\/embed\/([^?#]+)/,
    /youtube\.com\/shorts\/([^?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchOEmbed(videoUrl: string): Promise<any> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'monorama-crm/1.0' } });
  if (!res.ok) throw new Error('oEmbed_failed');
  return await res.json();
}

// 메타데이터 미리보기 (저장 전 미리 확인)
router.post('/preview-meta', requireAdvertiser, async (req: Request, res: Response) => {
  const { youtube_url } = req.body;
  const videoId = extractYouTubeId(String(youtube_url || ''));
  if (!videoId) return res.status(400).json({ error: '유효한 YouTube URL을 입력하세요.' });
  try {
    const meta = await fetchOEmbed(`https://www.youtube.com/watch?v=${videoId}`);
    res.json({
      ok: true,
      video_id: videoId,
      meta: {
        title: meta.title || '',
        author_name: meta.author_name || '',
        author_url: meta.author_url || '',
        thumbnail_url: meta.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        embed_html: meta.html || '',
        width: meta.width || null,
        height: meta.height || null,
      },
    });
  } catch {
    // oEmbed 실패 시 thumbnail만이라도 반환 (비공개 영상이거나 일시적 오류)
    res.json({
      ok: true,
      video_id: videoId,
      meta: {
        title: '',
        author_name: '',
        author_url: '',
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        embed_html: '',
        width: null,
        height: null,
      },
      partial: true,
    });
  }
});

// 목록
router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { video_type, keyword, page = 1, size = 10 } = req.query;
  let where = 'WHERE advertiser_id = ? AND is_deleted = 0';
  const params: any[] = [adv.id];
  if (video_type && VIDEO_TYPES.includes(String(video_type) as VideoType)) {
    where += ' AND video_type = ?'; params.push(video_type);
  }
  if (keyword) {
    where += ' AND (title LIKE ? OR author_name LIKE ? OR memo LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM youtube_videos ${where}`, params);
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT id, video_type, video_id, youtube_url, title, author_name, author_url,
            thumbnail_url, width, height, memo, created_at, updated_at
       FROM youtube_videos ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
});

// ── 동영상 대시보드 통계 ────────────────────────────────────
// 전체/금일/금주 업로드 개수, 전체·평균 조회수
router.get('/stats', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT
       COUNT(*)                                                      AS total,
       COALESCE(SUM(DATE(created_at)=CURDATE()),0)                   AS today,
       COALESCE(SUM(YEARWEEK(created_at,1)=YEARWEEK(CURDATE(),1)),0) AS week,
       COALESCE(SUM(view_count),0)                                   AS total_views,
       COALESCE(ROUND(AVG(view_count),1),0)                          AS avg_views
     FROM youtube_videos WHERE advertiser_id=? AND is_deleted=0`, [adv.id]);
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

// 조회수 +1 (미리보기 재생 시)
router.post('/:id/view', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  await pool.execute(
    `UPDATE youtube_videos SET view_count = view_count + 1 WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [req.params.id, adv.id]);
  res.json({ ok: true });
});

// 단건
router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM youtube_videos WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json({ ok: true, video: rows[0] });
});

// 등록
router.post('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { youtube_url, video_type, memo } = req.body;
  if (!VIDEO_TYPES.includes(video_type)) return res.status(400).json({ error: 'video_type 값이 잘못되었습니다.' });
  const videoId = extractYouTubeId(String(youtube_url || ''));
  if (!videoId) return res.status(400).json({ error: '유효한 YouTube URL을 입력하세요.' });

  let meta: any = {};
  try {
    meta = await fetchOEmbed(`https://www.youtube.com/watch?v=${videoId}`);
  } catch { meta = {}; }

  try {
    const [result]: any = await pool.execute(
      `INSERT INTO youtube_videos
        (advertiser_id, video_type, video_id, youtube_url, title, author_name, author_url,
         thumbnail_url, embed_html, width, height, memo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        adv.id, video_type, videoId, youtube_url,
        meta.title || null, meta.author_name || null, meta.author_url || null,
        meta.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        meta.html || null,
        meta.width || null, meta.height || null,
        memo || null,
      ]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '이미 등록된 영상입니다.' });
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
});

// 수정 (memo 만, 또는 다시 fetch)
router.put('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const { memo, refetch_meta } = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  if (memo !== undefined) { sets.push('memo=?'); vals.push(memo); }

  if (refetch_meta) {
    const [rows] = await pool.execute<any[]>('SELECT video_id FROM youtube_videos WHERE id=? AND advertiser_id=? AND is_deleted=0', [id, adv.id]);
    if (!rows.length) return res.status(404).json({ error: '찾을 수 없습니다.' });
    try {
      const meta: any = await fetchOEmbed(`https://www.youtube.com/watch?v=${rows[0].video_id}`);
      sets.push('title=?', 'author_name=?', 'author_url=?', 'thumbnail_url=?', 'embed_html=?', 'width=?', 'height=?');
      vals.push(meta.title || null, meta.author_name || null, meta.author_url || null,
                meta.thumbnail_url || `https://img.youtube.com/vi/${rows[0].video_id}/hqdefault.jpg`,
                meta.html || null, meta.width || null, meta.height || null);
    } catch {}
  }

  if (!sets.length) return res.status(400).json({ error: '변경할 항목이 없습니다.' });
  vals.push(id, adv.id);
  const [result]: any = await pool.execute(
    `UPDATE youtube_videos SET ${sets.join(', ')} WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    vals
  );
  if (!result.affectedRows) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json({ ok: true });
});

// 삭제 (soft delete)
router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const actor = getActor(req);
  const [result]: any = await pool.execute(
    `UPDATE youtube_videos SET is_deleted=1, deleted_at=NOW(), deleted_by=?
       WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [actor, req.params.id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json({ ok: true });
});

export default router;
