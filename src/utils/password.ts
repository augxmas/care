// 임시 비밀번호 생성 — 대/소문자, 숫자, 특수문자 각 1+ 포함 8자
export function generateTempPassword(): string {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '!@#$%^&*';
  const all     = upper + lower + digits + special;
  const rand    = (s: string) => s[Math.floor(Math.random() * s.length)];
  const pw: string[] = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 4; i++) pw.push(rand(all));
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

// 비밀번호 정책 (대소문자/숫자/특수문자 포함 8자 이상)
export const PW_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
