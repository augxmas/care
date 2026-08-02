import { Request, Response, NextFunction } from 'express';

export function requireAdvertiser(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).advertiser) {
    return next();
  }
  if (req.xhr || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  res.redirect('/');
}

export function requireSupervisor(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).supervisor) {
    return next();
  }
  if (req.xhr || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  }
  res.redirect('/supervisor');
}

export function updateActivity(req: Request, _res: Response, next: NextFunction) {
  (req.session as any).lastActivity = Date.now();
  next();
}

// ── 역할 기반 가드 (일정관리) ──────────────────────────────
// 의사/담당자 로그인 시에도 session.advertiser 와 session.user.role 이 함께 설정된다.
function isApi(req: Request): boolean {
  return req.xhr || req.originalUrl.startsWith('/api/');
}

function denyAuth(req: Request, res: Response) {
  if (isApi(req)) return res.status(403).json({ error: '접근 권한이 없습니다.' });
  res.redirect('/');
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req.session as any).advertiser) {
      if (isApi(req)) return res.status(401).json({ error: '로그인이 필요합니다.' });
      return res.redirect('/');
    }
    const role = (req.session as any).user?.role || 'advertiser';
    if (!roles.includes(role)) return denyAuth(req, res);
    next();
  };
}

// 관리자(병원 광고주)만
export const requireAdmin = requireRole('advertiser');
// 일정 생성/수정 권한 (관리자 + 담당자)
export const requireScheduler = requireRole('advertiser', 'manager');
// 일정 조회 권한 (관리자 + 담당자 + 의사)
export const requireScheduleViewer = requireRole('advertiser', 'manager', 'doctor');

// 고객(환자) — 별도 세션 키 session.customer
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any).customer) return next();
  if (isApi(req)) return res.status(401).json({ error: '로그인이 필요합니다.' });
  res.redirect('/my-schedule');
}
