import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { getActor } from '../utils/actor';
import { uploadRecruiterDocs } from '../middleware/upload';

const router = Router();

const TEXT_FIELDS = [
  'company_name','business_no','ceo_name','biz_type','biz_category',
  'address1','address2','postal_code',
  'contact_name','contact_email','contact_mobile','contact_phone',
  'recruiter_license_no','surety_bond_no','commission_rate',
];

const FILE_FIELDS = [
  { name: 'biz_cert',       maxCount: 1 },
  { name: 'recruiter_cert', maxCount: 1 },
  { name: 'surety_cert',    maxCount: 1 },
];

function pickText(body: any): Record<string, any> {
  const out: any = {};
  for (const k of TEXT_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// 목록
router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { keyword, status, page = 1, size = 10 } = req.query;
  let where = 'WHERE advertiser_id = ? AND is_deleted = 0';
  const params: any[] = [adv.id];
  if (keyword) {
    where += ' AND (company_name LIKE ? OR business_no LIKE ? OR recruiter_license_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { where += ' AND status = ?'; params.push(status); }
  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) AS total FROM recruiters ${where}`, params);
  const total = countRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT id, company_name, business_no, ceo_name, biz_type, biz_category,
            address1, address2, postal_code,
            contact_name, contact_email, contact_mobile, contact_phone,
            recruiter_license_no, surety_bond_no, commission_rate,
            biz_cert_name, recruiter_cert_name, surety_cert_name,
            status, status_reason, approved_at, approved_by,
            created_at, updated_at
       FROM recruiters ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
});

// 단건 조회
router.get('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM recruiters WHERE id = ? AND advertiser_id = ? AND is_deleted = 0',
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '찾을 수 없습니다.' });
  // 파일 경로는 노출 금지 (파일명만)
  const r: any = rows[0];
  delete r.biz_cert_path; delete r.recruiter_cert_path; delete r.surety_cert_path;
  res.json({ ok: true, recruiter: r });
});

// 번호 중복 검사 (사업자등록번호·유치기관 등록번호·보증보험 증권번호는 전역 유일)
async function findDupNumberError(body: any, excludeId: number | null): Promise<string | null> {
  const checks: [string, string][] = [
    ['business_no', '사업자등록번호'],
    ['recruiter_license_no', '유치기관 등록번호'],
    ['surety_bond_no', '보증보험 증권번호'],
  ];
  for (const [field, label] of checks) {
    const value = body[field];
    if (value == null || String(value).trim() === '') continue;
    const params: any[] = [String(value).trim()];
    let sql = `SELECT id FROM recruiters WHERE ${field}=? AND is_deleted=0`;
    if (excludeId) { sql += ' AND id<>?'; params.push(excludeId); }
    const [rows] = await pool.execute<any[]>(sql + ' LIMIT 1', params);
    if (rows.length) return `이미 등록된 ${label}입니다.`;
  }
  return null;
}

// 등록 (파일 업로드 포함)
router.post('/', requireAdvertiser,
  uploadRecruiterDocs.fields(FILE_FIELDS),
  async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const body = pickText(req.body);
    if (!body.company_name || !body.business_no) {
      return res.status(400).json({ error: '회사명과 사업자등록번호는 필수입니다.' });
    }
    const dupErr = await findDupNumberError(body, null);
    if (dupErr) return res.status(400).json({ error: dupErr });
    const files = req.files as { [k: string]: Express.Multer.File[] };
    const fileCols: any = {};
    for (const f of FILE_FIELDS) {
      const file = files?.[f.name]?.[0];
      if (file) {
        fileCols[`${f.name}_path`] = file.path;
        fileCols[`${f.name}_name`] = file.originalname;
      }
    }
    const cols = ['advertiser_id', ...Object.keys(body), ...Object.keys(fileCols)];
    const vals = [adv.id, ...Object.values(body), ...Object.values(fileCols)];
    try {
      const [result]: any = await pool.execute(
        `INSERT INTO recruiters (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        vals
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '이미 등록된 사업자등록번호입니다.' });
      console.error(e);
      res.status(500).json({ error: '저장에 실패했습니다.' });
    }
  }
);

// 수정 (파일 교체 선택적)
router.put('/:id', requireAdvertiser,
  uploadRecruiterDocs.fields(FILE_FIELDS),
  async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const id  = parseInt(req.params.id);
    const body = pickText(req.body);
    const dupErr = await findDupNumberError(body, id);
    if (dupErr) return res.status(400).json({ error: dupErr });
    const sets: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(body)) { sets.push(`${k}=?`); vals.push(v); }

    const files = req.files as { [k: string]: Express.Multer.File[] };
    for (const f of FILE_FIELDS) {
      const file = files?.[f.name]?.[0];
      if (file) {
        sets.push(`${f.name}_path=?`); vals.push(file.path);
        sets.push(`${f.name}_name=?`); vals.push(file.originalname);
      }
    }
    if (!sets.length) return res.status(400).json({ error: '변경할 항목이 없습니다.' });
    vals.push(id, adv.id);
    try {
      const [result]: any = await pool.execute(
        `UPDATE recruiters SET ${sets.join(', ')} WHERE id=? AND advertiser_id=? AND is_deleted=0`,
        vals
      );
      if (!result.affectedRows) return res.status(404).json({ error: '찾을 수 없습니다.' });
      res.json({ ok: true });
    } catch (e: any) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '이미 등록된 사업자등록번호입니다.' });
      console.error(e);
      res.status(500).json({ error: '저장에 실패했습니다.' });
    }
  }
);

// 승인/거부/보류 (관리자 = 광고주 본인)
router.put('/:id/status', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const { status, status_reason } = req.body;
  if (!['pending','approved','rejected','suspended'].includes(status)) {
    return res.status(400).json({ error: 'status 값이 잘못되었습니다.' });
  }
  const approvedAt = status === 'approved' ? new Date() : null;
  const [result]: any = await pool.execute(
    `UPDATE recruiters SET status=?, status_reason=?, approved_at=?, approved_by=?
       WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [status, status_reason || null, approvedAt, adv.contact_name || 'admin', id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json({ ok: true });
});

// 삭제 (soft delete)
router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const actor = getActor(req);
  const [result]: any = await pool.execute(
    `UPDATE recruiters SET is_deleted=1, deleted_at=NOW(), deleted_by=?
       WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [actor, req.params.id, adv.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: '찾을 수 없습니다.' });
  res.json({ ok: true });
});

// 첨부파일 inline 서빙
router.get('/:id/file/:type', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const type = req.params.type;
  if (!['biz_cert','recruiter_cert','surety_cert'].includes(type)) {
    return res.status(400).json({ error: 'type 값이 잘못되었습니다.' });
  }
  const [rows] = await pool.execute<any[]>(
    `SELECT ${type}_path AS p, ${type}_name AS n FROM recruiters WHERE id=? AND advertiser_id=? AND is_deleted=0`,
    [req.params.id, adv.id]
  );
  if (!rows.length || !rows[0].p) return res.status(404).json({ error: '파일이 없습니다.' });
  let filePath: string = rows[0].p;
  if (!fs.existsSync(filePath)) {
    const basename = path.basename(filePath.replace(/\\/g, '/'));
    const fallback = path.join(process.cwd(), 'uploads', 'recruiters', basename);
    if (!fs.existsSync(fallback)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    filePath = fallback;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.pdf' ? 'application/pdf'
             : ext === '.png' ? 'image/png'
             : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg'
             : 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(rows[0].n || 'doc' + ext)}"`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
