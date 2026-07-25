import { Request } from 'express';

const ROLE_LABEL: Record<string, string> = {
  advertiser: '관리자',
  doctor:     '의사',
  manager:    '담당자',
};

/**
 * 감사 필드(deleted_by, note_updated_by 등) 에 쓸 작성자 라벨 반환.
 * 로그인한 사용자(role+name)를 우선으로 하고, 없으면 광고주 contact_name 폴백.
 */
export function getActor(req: Request): string {
  const sess: any = req.session;
  const u = sess?.user;
  if (u && u.name) {
    const label = ROLE_LABEL[u.role] || '사용자';
    return `${label} ${u.name}`;
  }
  const a = sess?.advertiser;
  if (a?.contact_name) return `관리자 ${a.contact_name}`;
  if (a?.id) return `광고주#${a.id}`;
  return '시스템';
}
