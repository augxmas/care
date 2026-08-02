import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { uploadResourceImage } from '../middleware/upload';

const router = Router();
const LANGUAGES = ['ko', 'th', 'vi', 'ar', 'en', 'zh', 'ja'];

function normalizeTags(raw: any): string {
  return [...new Set(String(raw || '').split(/[,\s]+/).map(v => v.trim()).filter(Boolean))].slice(0, 30).join(',');
}

router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiser = (req.session as any).advertiser;
  const keyword = String(req.query.search || '').trim();
  const language = String(req.query.language || '').trim().toLowerCase();
  const params: any[] = [advertiser.id];
  let where = 'WHERE advertiser_id=?';
  if (keyword) {
    where += ' AND (description LIKE ? OR tags LIKE ? OR original_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (LANGUAGES.includes(language)) { where += ' AND language=?'; params.push(language); }
  const [rows] = await pool.execute<any[]>(
    `SELECT id,original_name,image_url,description,tags,language,size_bytes,created_at
       FROM resource_images ${where} ORDER BY created_at DESC,id DESC`,
    params,
  );
  res.json({ ok: true, data: rows });
});

router.post('/', requireAdvertiser, uploadResourceImage.single('image'), async (req: Request, res: Response) => {
  const advertiser = (req.session as any).advertiser;
  const file = req.file;
  if (!file) return res.status(400).json({ error: '이미지를 선택하세요.' });
  const language = String(req.body.language || '').trim().toLowerCase();
  if (!LANGUAGES.includes(language)) return res.status(400).json({ error: '지원 언어를 선택하세요.' });
  const description = String(req.body.description || '').trim().slice(0, 2000);
  const tags = normalizeTags(req.body.tags);
  const imageUrl = `/uploads/active/${advertiser.id}/library/${file.filename}`;
  const [result] = await pool.execute<any>(
    `INSERT INTO resource_images
      (advertiser_id,original_name,stored_name,image_url,description,tags,language,mime_type,size_bytes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [advertiser.id, file.originalname, file.filename, imageUrl, description, tags, language, file.mimetype, file.size],
  );
  res.json({ ok: true, id: result.insertId, image_url: imageUrl, message: '이미지가 자료실에 등록되었습니다.' });
});

router.put('/:id', requireAdvertiser, uploadResourceImage.single('image'), async (req: Request, res: Response) => {
  const advertiser = (req.session as any).advertiser;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '자료 번호가 올바르지 않습니다.' });
  const [rows] = await pool.execute<any[]>(
    'SELECT id,image_url,original_name,stored_name,mime_type,size_bytes FROM resource_images WHERE id=? AND advertiser_id=?',
    [id, advertiser.id],
  );
  if (!rows.length) return res.status(404).json({ error: '수정할 이미지를 찾을 수 없습니다.' });
  const language = String(req.body.language || '').trim().toLowerCase();
  if (!LANGUAGES.includes(language)) return res.status(400).json({ error: '지원 언어를 선택하세요.' });
  const description = String(req.body.description || '').trim().slice(0, 2000);
  const tags = normalizeTags(req.body.tags);
  const file = req.file;
  const imageUrl = file ? `/uploads/active/${advertiser.id}/library/${file.filename}` : rows[0].image_url;
  await pool.execute(
    `UPDATE resource_images SET original_name=?,stored_name=?,image_url=?,description=?,tags=?,language=?,mime_type=?,size_bytes=?
      WHERE id=? AND advertiser_id=?`,
    [
      file?.originalname || rows[0].original_name,
      file?.filename || rows[0].stored_name,
      imageUrl, description, tags, language,
      file?.mimetype || rows[0].mime_type,
      file?.size || rows[0].size_bytes,
      id, advertiser.id,
    ],
  );
  res.json({ ok: true, image_url: imageUrl, message: '자료실 이미지를 수정했습니다.' });
});

router.delete('/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const advertiser = (req.session as any).advertiser;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '자료 번호가 올바르지 않습니다.' });
  const [rows] = await pool.execute<any[]>(
    'SELECT id,stored_name FROM resource_images WHERE id=? AND advertiser_id=?',
    [id, advertiser.id],
  );
  if (!rows.length) return res.status(404).json({ error: '삭제할 이미지를 찾을 수 없습니다.' });
  await pool.execute('DELETE FROM resource_images WHERE id=? AND advertiser_id=?', [id, advertiser.id]);
  const libraryDir = path.resolve(process.cwd(), 'uploads', 'active', String(advertiser.id), 'library');
  const filePath = path.resolve(libraryDir, path.basename(String(rows[0].stored_name || '')));
  if (filePath.startsWith(`${libraryDir}${path.sep}`) && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (error) { console.error('[Resource Library] file delete failed:', error); }
  }
  res.json({ ok: true, message: '자료실 이미지를 삭제했습니다.' });
});

export default router;
