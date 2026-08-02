import express from 'express';
import session from 'express-session';
import MySQLStore from 'express-mysql-session';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

import pool, { getIsSqlite, checkDatabaseConnection } from './config/database';
import authRouter     from './routes/auth';
import campaignRouter from './routes/campaign';
import adminRouter    from './routes/admin';
import staffRouter    from './routes/staff';
import recruiterRouter from './routes/recruiter';
import noticeRouter    from './routes/notice';
import emailRouter     from './routes/email';
import videoRouter     from './routes/video';
import surveyRouter    from './routes/survey';
import surveyPublicRouter from './routes/survey-public';
import scheduleRouter  from './routes/schedule';
import holidaysRouter  from './routes/holidays';
import settlementRouter from './routes/settlement';
import consultRouter   from './routes/consult';
import consultPublicRouter from './routes/consult-public';
import resourceLibraryRouter from './routes/resource-library';
import { initChat } from './realtime/chat';

const app  = express();
const PORT = parseInt(process.env.PORT || '3000');
const SESSION_TIMEOUT_SEC = Math.max(60, parseInt(process.env.SESSION_TIMEOUT_SEC || '600'));

// ── Delegating Session Middleware ──────────────────────────
let dynamicSessionMiddleware: any = null;

const sessionMiddleware = (req: any, res: any, next: any) => {
  if (dynamicSessionMiddleware) {
    dynamicSessionMiddleware(req, res, next);
  } else {
    next();
  }
};

app.use(sessionMiddleware);

// ── Middleware ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
// uploads/active만 서빙 (backup은 서빙 안 함)
app.use('/uploads/active', express.static(path.join(__dirname, '..', 'uploads', 'active')));

// ── API Routes ────────────────────────────────────────────
// 세션 타임아웃 설정 (인증 불필요, 클라이언트 세션 매니저 동기화용)
app.get('/api/auth/config', (_req, res) => {
  res.json({ sessionTimeoutSec: SESSION_TIMEOUT_SEC });
});
app.use('/api/auth',      authRouter);
app.use('/api/campaigns', campaignRouter);
app.use('/api/admin',     adminRouter);
app.use('/api/staff',     staffRouter);
app.use('/api/recruiters', recruiterRouter);
app.use('/api/notices',   noticeRouter);
app.use('/api/email',     emailRouter);
app.use('/api/videos',    videoRouter);
app.use('/api/surveys',   surveyRouter);
app.use('/api/public/surveys', surveyPublicRouter);
app.use('/api/schedule',  scheduleRouter);
app.use('/api/holidays',  holidaysRouter);
app.use('/api/settlement', settlementRouter);
app.use('/api/consult',   consultRouter);
app.use('/api/public/consult', consultPublicRouter);
app.use('/api/resources', resourceLibraryRouter);

// ── Page Routes ───────────────────────────────────────────
// 병원 CRM 시스템: /admin/*
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/admin/register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'register.html'));
});
app.get('/admin/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// 관리자(supervisor) 시스템: /supervisor/*
app.get('/supervisor', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'index.html'));
});
app.get('/supervisor/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'dashboard.html'));
});
app.get('/supervisor/hospitals', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'hospitals.html'));
});
app.get('/supervisor/hospital-form-builder', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'hospital-form-builder.html'));
});
app.get('/supervisor/agencies', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'agencies.html'));
});
app.get('/supervisor/agency-form-builder', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'supervisor', 'agency-form-builder.html'));
});
app.get('/hospital-register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'hospital-register.html'));
});
app.get('/agency-register', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'agency-register.html'));
});
app.get('/agency-hospital-request/:token', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'agency-hospital-request.html'));
});

// 공개 문진 폼 — /s/:id
app.get('/s/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'survey.html'));
});

// 캠페인 수집 폼 — /campaign-form/:id
app.get('/campaign-form/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'campaign-form.html'));
});

// 캠페인 이미지 노출 페이지 — /campaign-image/:id
app.get('/campaign-image/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'campaign-image.html'));
});

// 외부 공지사항 팝업 — /notice/:id
app.get('/notice/:id', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'notice.html'));
});
app.get('/notices', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'notices.html'));
});

// 고객(환자) 일정 자가조회 — /my-schedule
app.get('/my-schedule', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'my-schedule.html'));
});

// 온라인 1:1 상담 (공개) — /consult, 채팅 — /consult-chat
app.get('/consult', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'consult.html'));
});
app.get('/consult-chat', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'consult-chat.html'));
});

// 메인 홈페이지 서비스 및 구 경로 리다이렉트
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.get('/dashboard', (_req, res) => res.redirect('/admin/dashboard'));
app.get('/register', (_req, res) => res.redirect('/admin/register'));

// ── HTTP + WebSocket(socket.io) ───────────────────────────
const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: true, credentials: true } });

io.engine.use((req: any, res: any, next: any) => {
  if (dynamicSessionMiddleware) {
    dynamicSessionMiddleware(req, res, next);
  } else {
    next();
  }
});

app.set('io', io);
initChat(io);

async function bootstrap() {
  // Verify database connection at startup
  await checkDatabaseConnection();
  if (!getIsSqlite()) {
    await pool.execute('ALTER TABLE consult_credentials ADD COLUMN IF NOT EXISTS code_hash VARCHAR(255) NULL AFTER email');
    const [legacyCredentialColumns] = await pool.execute<any[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema=DATABASE() AND table_name='consult_credentials' AND column_name='password_hash'`,
    );
    if (legacyCredentialColumns.length) {
      await pool.execute('UPDATE consult_credentials SET code_hash=password_hash WHERE code_hash IS NULL AND password_hash IS NOT NULL');
      await pool.execute('ALTER TABLE consult_credentials MODIFY password_hash LONGTEXT NULL');
    }
    await pool.execute('ALTER TABLE consult_credentials MODIFY code_hash VARCHAR(255) NOT NULL');
    await pool.execute('ALTER TABLE consult_credentials ADD COLUMN IF NOT EXISTS updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
    await pool.execute('ALTER TABLE consult_posts MODIFY password_hash VARCHAR(255) NULL');
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS resource_images (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id BIGINT NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        description TEXT NULL,
        tags TEXT NULL,
        language VARCHAR(10) NOT NULL DEFAULT 'en',
        mime_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_resource_images_owner_created (advertiser_id,created_at),
        INDEX idx_resource_images_language (advertiser_id,language)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Keep chat_tokens compatible with databases created before public consultation
    // tokens started carrying the hospital and customer identity.
    await pool.execute('ALTER TABLE chat_tokens ADD COLUMN IF NOT EXISTS advertiser_id BIGINT NULL AFTER token');
    await pool.execute('ALTER TABLE chat_tokens ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL AFTER conversation_id');
    await pool.execute('ALTER TABLE chat_tokens ADD COLUMN IF NOT EXISTS revoked TINYINT(1) NOT NULL DEFAULT 0 AFTER expires_at');
    const [legacyChatTokenColumns] = await pool.execute<any[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema=DATABASE() AND table_name='chat_tokens' AND column_name='participant_type'`,
    );
    if (legacyChatTokenColumns.length) {
      await pool.execute('ALTER TABLE chat_tokens MODIFY participant_type LONGTEXT NULL');
    }
    await pool.execute(
      `UPDATE chat_tokens t
         JOIN chat_conversations c ON c.id=t.conversation_id
          SET t.advertiser_id=COALESCE(t.advertiser_id,c.advertiser_id),
              t.customer_email=COALESCE(t.customer_email,c.customer_email)
        WHERE t.advertiser_id IS NULL OR t.customer_email IS NULL`,
    );
    await pool.execute('CREATE INDEX IF NOT EXISTS idx_chat_tokens_lookup ON chat_tokens(token,revoked)');
    await pool.execute('ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS advertiser_id BIGINT NULL AFTER id');
    await pool.execute('ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS uploader_type VARCHAR(20) NULL AFTER conversation_id');
    await pool.execute('ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS uploader_id BIGINT NULL AFTER uploader_type');
    await pool.execute('ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS original_name VARCHAR(255) NULL AFTER file_path');
    await pool.execute('ALTER TABLE chat_attachments ADD COLUMN IF NOT EXISTS size_bytes INT NULL AFTER mime_type');
    const [legacyAttachmentColumns] = await pool.execute<any[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema=DATABASE() AND table_name='chat_attachments'
          AND column_name IN ('sender_type','file_name','file_size')`,
    );
    const legacyAttachmentColumnNames = new Set(
      legacyAttachmentColumns.map((column: any) => String(column.column_name)),
    );
    if (legacyAttachmentColumnNames.has('sender_type')) {
      await pool.execute('UPDATE chat_attachments SET uploader_type=sender_type WHERE uploader_type IS NULL');
      await pool.execute('ALTER TABLE chat_attachments MODIFY sender_type LONGTEXT NULL');
    }
    if (legacyAttachmentColumnNames.has('file_name')) {
      await pool.execute('UPDATE chat_attachments SET original_name=file_name WHERE original_name IS NULL');
      await pool.execute('ALTER TABLE chat_attachments MODIFY file_name LONGTEXT NULL');
    }
    if (legacyAttachmentColumnNames.has('file_size')) {
      await pool.execute('UPDATE chat_attachments SET size_bytes=file_size WHERE size_bytes IS NULL');
      await pool.execute('ALTER TABLE chat_attachments MODIFY file_size BIGINT NULL');
    }
    await pool.execute(
      `UPDATE chat_attachments att
         JOIN chat_conversations c ON c.id=att.conversation_id
          SET att.advertiser_id=COALESCE(att.advertiser_id,c.advertiser_id)
        WHERE att.advertiser_id IS NULL`,
    );
    await pool.execute(
      'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS staff_only TINYINT(1) NOT NULL DEFAULT 0 AFTER attachment_id',
    );
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS consult_post_attachments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        advertiser_id BIGINT NOT NULL,
        post_id BIGINT NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NULL,
        size_bytes INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_consult_post_attachment (advertiser_id,post_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.execute('ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS company_name_en VARCHAR(200) NULL AFTER company_name');
    await pool.execute('ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS company_name_en VARCHAR(200) NULL AFTER company_name');
    await pool.execute('ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS hospital_id VARCHAR(64) NULL AFTER company_name');
    await pool.execute(`UPDATE hospitals SET hospital_id=CASE WHEN company_name='모즈의원' THEN 'mods' ELSE CONCAT('hospital-',id) END WHERE hospital_id IS NULL OR hospital_id=''`);
    await pool.execute('ALTER TABLE hospitals MODIFY hospital_id VARCHAR(64) NOT NULL');
    await pool.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitals_hospital_id ON hospitals(hospital_id)');
    await pool.execute(
      `INSERT INTO hospital_form_fields (field_key,enabled,required,searchable,sort_order)
       VALUES ('hospital_id',1,1,1,3)
       ON DUPLICATE KEY UPDATE enabled=1,required=1,searchable=1`,
    );
    await pool.execute(
      `INSERT INTO hospital_form_fields (field_key,enabled,required,searchable,sort_order)
       VALUES ('company_name_en',1,0,1,2)
       ON DUPLICATE KEY UPDATE enabled=1,searchable=1`,
    );
    await pool.execute(
      `INSERT INTO agency_form_fields (field_key,enabled,required,searchable,sort_order)
       VALUES ('company_name_en',1,0,1,2)
       ON DUPLICATE KEY UPDATE enabled=1,searchable=1`,
    );
    await pool.execute(
      `UPDATE hospital_form_fields SET sort_order=CASE field_key
        WHEN 'company_name' THEN 1 WHEN 'company_name_en' THEN 2 WHEN 'hospital_id' THEN 3
        WHEN 'ceo_name' THEN 4 WHEN 'business_no' THEN 5 WHEN 'biz_cert' THEN 6
        WHEN 'representative_phone' THEN 7 WHEN 'address1' THEN 8 WHEN 'address2' THEN 9
        WHEN 'postal_code' THEN 10 WHEN 'medical_subjects' THEN 11 WHEN 'fax' THEN 12
        WHEN 'homepage' THEN 13 WHEN 'contact_name' THEN 14 WHEN 'contact_mobile' THEN 15
        WHEN 'contact_email' THEN 16 WHEN 'serial_no' THEN 17 ELSE sort_order END`,
    );
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS hospital_agency_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT NOT NULL,
        advertiser_id BIGINT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        token_hash VARCHAR(191) NOT NULL UNIQUE,
        requested_by VARCHAR(191),
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_hospital_agency (hospital_id, advertiser_id),
        CONSTRAINT fk_har_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        CONSTRAINT fk_har_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Set up session store dynamically
  let sessionStore: any;
  if (getIsSqlite()) {
    console.log('[AI Studio] Using MemoryStore for sessions in SQLite fallback mode');
    sessionStore = new session.MemoryStore();
  } else {
    console.log('[AI Studio] Using MySQLStore for sessions');
    const MySQLStoreSession = MySQLStore(session as any);
    sessionStore = new MySQLStoreSession({
      clearExpired:         true,
      checkExpirationInterval: 900000,
      expiration:          86400000,
      createDatabaseTable:  true,
      schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
    } as any, pool as any);
  }

  dynamicSessionMiddleware = session({
    secret:            process.env.SESSION_SECRET || 'monorama_secret',
    store:             sessionStore,
    resave:            false,
    rolling:           true,
    saveUninitialized: false,
    cookie: {
      secure:   false,
      httpOnly: true,
      maxAge:   SESSION_TIMEOUT_SEC * 1000,
    },
  });

  server.listen(PORT, () => {
    console.log(`모노라마 병원 CRM 시스템 실행 중: http://localhost:${PORT}`);
  });
}

bootstrap().catch(err => {
  console.error('[AI Studio] Bootstrap error:', err);
});

export default app;
