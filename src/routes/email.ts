import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { sendRawEmail } from '../services/email.service';
import { getActor } from '../utils/actor';

const router = Router();

// 첨부 최대 용량(.env: EMAIL_MAX_ATTACH_MB, 기본 30MB)
const MAX_ATTACH_MB = Math.max(1, parseInt(process.env.EMAIL_MAX_ATTACH_MB || '30'));
const uploadEmail = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACH_MB * 1024 * 1024 } });

function emailOk(e: any): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '')); }
function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// multer 에러(용량 초과 등) → 400 JSON
function emailUpload(req: Request, res: Response, next: NextFunction) {
  uploadEmail.array('files', 10)(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `첨부 파일은 최대 ${MAX_ATTACH_MB}MB까지 가능합니다.`
        : (err.message || '파일 업로드 실패');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}

// ── 첨부 설정 (프론트 표시용) ───────────────────────────────
router.get('/config', requireAdvertiser, (_req: Request, res: Response) => {
  res.json({ ok: true, maxAttachMb: MAX_ATTACH_MB });
});

// ── 메일 발송 (본 시스템에서 직접 작성, 첨부 가능) ──────────
router.post('/send', requireAdvertiser, emailUpload, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const to = String(req.body.to || '').trim();
  const subject = String(req.body.subject || '').trim().slice(0, 480);
  const body = String(req.body.body || '');
  if (!emailOk(to)) return res.status(400).json({ error: '받는사람 이메일이 올바르지 않습니다.' });
  if (!subject) return res.status(400).json({ error: '제목을 입력하세요.' });
  if (!body.trim()) return res.status(400).json({ error: '내용을 입력하세요.' });

  const files = (req.files as Express.Multer.File[]) || [];
  const attachments = files.map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }));

  const attachNote = attachments.length
    ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">📎 첨부: ${attachments.map(a => esc(a.filename)).join(', ')}</div>`
    : '';
  const html = `<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${esc(body).replace(/\n/g, '<br>')}${attachNote}</div>`;
  try {
    await sendRawEmail({ to, subject, html, advertiserId: adv.id, sentBy: getActor(req), attachments });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: '메일 발송에 실패했습니다: ' + (e?.message || '') });
  }
});

// ── 발송 이력 (본 시스템 기록) ──────────────────────────────
router.get('/logs', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const to = req.query.to ? String(req.query.to).trim() : '';
  let where = 'WHERE advertiser_id = ?';
  const params: any[] = [adv.id];
  if (to) { where += ' AND to_email = ?'; params.push(to); }
  if (req.query.q) { where += ' AND (to_email LIKE ? OR subject LIKE ?)'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const [rows] = await pool.execute<any[]>(
    `SELECT id, template_key, to_email, subject, status, error_msg, sent_by,
            DATE_FORMAT(sent_at,'%Y-%m-%d %H:%i:%s') AS sent_at
       FROM email_logs ${where} ORDER BY id DESC LIMIT 200`, params);
  res.json({ ok: true, data: rows });
});

// ── 발송 이력 상세 (본문 포함) ──────────────────────────────
router.get('/logs/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    `SELECT id, template_key, to_email, subject, body, status, error_msg, sent_by,
            DATE_FORMAT(sent_at,'%Y-%m-%d %H:%i:%s') AS sent_at
       FROM email_logs WHERE id=? AND advertiser_id=?`, [parseInt(req.params.id), adv.id]);
  if (!rows.length) return res.status(404).json({ error: '이력을 찾을 수 없습니다.' });
  res.json({ ok: true, log: rows[0] });
});

export default router;
