import pool from '../config/database';

export type EffectiveDay = {
  date: string;            // 'YYYY-MM-DD'
  effective_type: 'closed' | 'working' | 'normal';
  name: string | null;
  is_national: boolean;    // 시스템 시드(전국 공휴일)
  is_override: boolean;    // 병원 관리자 오버라이드
};

// 'YYYY-MM-DD' 정규화 (DATE 컬럼이 Date 객체로 올 수 있음)
export function ymd(d: any): string {
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 기간 내 (시스템 시드 + 해당 병원 오버라이드)를 조회해 유효 상태 맵 생성
export async function getHolidayMap(
  advertiserId: number,
  from: string,
  to: string
): Promise<Record<string, EffectiveDay>> {
  const [rows] = await pool.execute<any[]>(
    `SELECT advertiser_id, holiday_date, name, day_type, is_system
       FROM holidays
      WHERE holiday_date BETWEEN ? AND ?
        AND (advertiser_id IS NULL OR advertiser_id = ?)`,
    [from, to, advertiserId]
  );

  const sys: Record<string, any> = {};
  const ovr: Record<string, any> = {};
  for (const r of rows) {
    const key = ymd(r.holiday_date);
    if (r.advertiser_id == null) sys[key] = r;
    else ovr[key] = r;
  }

  const map: Record<string, EffectiveDay> = {};
  const keys = new Set([...Object.keys(sys), ...Object.keys(ovr)]);
  for (const key of keys) {
    const o = ovr[key];
    const s = sys[key];
    if (o) {
      // 오버라이드 우선: working=공휴일을 근무로 / closed=평일을 휴무로
      map[key] = {
        date: key,
        effective_type: o.day_type,
        name: o.name || (s ? s.name : null),
        is_national: !!s,
        is_override: true,
      };
    } else if (s) {
      map[key] = { date: key, effective_type: 'closed', name: s.name, is_national: true, is_override: false };
    }
  }
  return map;
}

// 특정 날짜가 (해당 병원 기준) 휴무인지
export async function isClosedDay(advertiserId: number, date: string): Promise<boolean> {
  const d = date.slice(0, 10);
  const map = await getHolidayMap(advertiserId, d, d);
  const eff = map[d];
  return !!eff && eff.effective_type === 'closed';
}
