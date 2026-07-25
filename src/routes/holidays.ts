import { Router, Request, Response } from 'express';
import pool from '../config/database';
import { requireScheduleViewer, requireAdmin } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { getHolidayMap } from '../utils/holidays';

const router = Router();

function advId(req: Request): number {
  return (req.session as any).advertiser.id;
}

// 기간 내 유효 공휴일/휴무 맵
// GET /api/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', requireScheduleViewer, async (req: Request, res: Response) => {
  const from = String(req.query.from || '').slice(0, 10);
  const to   = String(req.query.to   || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: 'from/to 날짜가 올바르지 않습니다.' });
  }
  try {
    const map = await getHolidayMap(advId(req), from, to);
    res.json({ ok: true, holidays: map });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '조회에 실패했습니다.' });
  }
});

// 관리자 오버라이드 추가/변경 (관리자만)
// POST /api/holidays/override  { date, day_type:'working'|'closed', name?, force? }
router.post('/override', requireAdmin, async (req: Request, res: Response) => {
  const adv = advId(req);
  const date = String(req.body.date || '').slice(0, 10);
  const dayType = req.body.day_type === 'working' ? 'working' : req.body.day_type === 'closed' ? 'closed' : null;
  const name = req.body.name ? String(req.body.name).slice(0, 120) : null;
  const force = req.body.force === true || req.body.force === 1 || req.body.force === '1';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !dayType) {
    return res.status(400).json({ error: 'date 와 day_type(working|closed)을 확인하세요.' });
  }

  // 휴무로 전환 시 해당일 기존 예약이 있으면 확인 요구 (예약은 보존, 신규만 차단)
  if (dayType === 'closed' && !force) {
    const [cnt] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS n FROM appointments
        WHERE advertiser_id = ? AND is_deleted = 0 AND DATE(start_at) = ?`,
      [adv, date]
    );
    if (cnt[0].n > 0) {
      return res.status(409).json({
        error: `해당 날짜에 이미 ${cnt[0].n}건의 일정이 있습니다. 휴무일로 지정하면 신규 예약만 차단되고 기존 일정은 유지됩니다.`,
        needsConfirm: true,
        existing: cnt[0].n,
      });
    }
  }

  try {
    await pool.execute(
      `INSERT INTO holidays (advertiser_id, holiday_date, name, day_type, is_system, created_by)
       VALUES (?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE day_type = VALUES(day_type), name = VALUES(name), created_by = VALUES(created_by)`,
      [adv, date, name, dayType, getActor(req)]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '저장에 실패했습니다.' });
  }
});

// 관리자 오버라이드 제거 (시드/평일 기본값으로 복귀)
// DELETE /api/holidays/override/:date
router.delete('/override/:date', requireAdmin, async (req: Request, res: Response) => {
  const adv = advId(req);
  const date = String(req.params.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '날짜가 올바르지 않습니다.' });
  await pool.execute(
    `DELETE FROM holidays WHERE advertiser_id = ? AND holiday_date = ? AND is_system = 0`,
    [adv, date]
  );
  res.json({ ok: true });
});

export default router;
