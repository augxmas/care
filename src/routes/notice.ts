import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';

const router = Router();

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
    `SELECT id, title, is_pinned, view_count, created_by, created_at, updated_at
       FROM notices ${where}
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
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

// 단건 조회 (조회수 +1)
router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM notices WHERE id = ? AND advertiser_id = ? AND is_deleted = 0`,
    [id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '공지를 찾을 수 없습니다.' });
  await pool.execute(`UPDATE notices SET view_count = view_count + 1 WHERE id = ?`, [id]);
  res.json({ ok: true, notice: rows[0] });
});

// 작성
router.post('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { title, content, is_pinned } = req.body;
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  const [result]: any = await pool.execute(
    `INSERT INTO notices (advertiser_id, title, content, is_pinned, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [adv.id, String(title).slice(0, 300), content || '', is_pinned ? 1 : 0, adv.contact_name || '']
  );
  res.json({ ok: true, id: result.insertId });
});

// 수정
router.put('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const { title, content, is_pinned } = req.body;
  if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });
  const [result]: any = await pool.execute(
    `UPDATE notices SET title = ?, content = ?, is_pinned = ? WHERE id = ? AND advertiser_id = ? AND is_deleted = 0`,
    [String(title).slice(0, 300), content || '', is_pinned ? 1 : 0, id, adv.id]
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
