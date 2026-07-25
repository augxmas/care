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
