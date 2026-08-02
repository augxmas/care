import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'active');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const bizCertStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'biz-certs');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const adFileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || 'tmp';
    const dir = path.join(UPLOAD_ROOT, String(advertiserId));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const uploadBizCert = multer({
  storage: bizCertStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('PDF, JPG, PNG 파일만 업로드 가능합니다.'));
    }
  },
});

const recruiterDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'recruiters');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const uploadRecruiterDocs = multer({
  storage: recruiterDocStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('PDF, JPG, PNG 파일만 업로드 가능합니다.'));
  },
});

const surveyImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || 'tmp';
    const dir = path.join(UPLOAD_ROOT, String(advertiserId), 'surveys');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

export const uploadSurveyImage = multer({
  storage: surveyImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('JPG/PNG/GIF/WEBP/SVG 만 업로드 가능합니다.'));
  },
});

const resourceImageStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || 'tmp';
    const dir = path.join(UPLOAD_ROOT, String(advertiserId), 'library');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
});

export const uploadResourceImage = multer({
  storage: resourceImageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase()) && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('JPG, PNG, GIF, WEBP 이미지 파일만 업로드할 수 있습니다.'));
  },
});

// ── 채팅 첨부 (txt 계열 차단) ──────────────────────────────
const chatFileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const advertiserId = (req.session as any).advertiser?.id || (req as any).chatCtx?.advertiserId || 'tmp';
    const dir = path.join(UPLOAD_ROOT, String(advertiserId), 'chat');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => { cb(null, `${uuidv4()}${path.extname(file.originalname)}`); },
});
const CHAT_BLOCKED_EXT = ['.txt', '.html', '.htm', '.json', '.js', '.css'];
const CHAT_BLOCKED_MIME = ['text/plain', 'text/html', 'application/json', 'text/javascript', 'application/javascript', 'text/css'];
const CHAT_ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.hwp', '.hwpx', '.zip'];
export const uploadChatFile = multer({
  storage: chatFileStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (CHAT_BLOCKED_EXT.includes(ext) || CHAT_BLOCKED_MIME.includes(file.mimetype)) {
      return cb(new Error('보안상 텍스트 기반 파일(txt/html/json/js/css)은 공유할 수 없습니다.'));
    }
    if (!CHAT_ALLOWED_EXT.includes(ext)) return cb(new Error('허용되지 않는 파일 형식입니다.'));
    cb(null, true);
  },
});

export const uploadAdFiles = multer({
  storage: adFileStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.html', '.htm'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('이미지(JPG/PNG/GIF/WEBP) 또는 HTML 파일만 업로드 가능합니다.'));
    }
  },
});
