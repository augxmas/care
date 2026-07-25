// ============================================================
// 대한민국 공휴일 시드 (2025~2027)
// 음력(설날·추석)은 런타임 계산하지 않고 확정 그레고리력 날짜를 하드코딩한다.
// 대체공휴일 포함. ※ 운영 적용 전 관공서 공휴일 규정 대비 사람 검토 필요.
// 실행:  npm run seed:holidays
// ============================================================
import pool from '../config/database';

type Holiday = { date: string; name: string };

export const KR_HOLIDAYS: Holiday[] = [
  // ── 2025 ──
  { date: '2025-01-01', name: '신정' },
  { date: '2025-01-28', name: '설날 연휴' },
  { date: '2025-01-29', name: '설날' },
  { date: '2025-01-30', name: '설날 연휴' },
  { date: '2025-03-01', name: '삼일절' },
  { date: '2025-03-03', name: '삼일절 대체공휴일' },
  { date: '2025-05-05', name: '어린이날·부처님오신날' },
  { date: '2025-05-06', name: '대체공휴일' },
  { date: '2025-06-06', name: '현충일' },
  { date: '2025-08-15', name: '광복절' },
  { date: '2025-10-03', name: '개천절' },
  { date: '2025-10-05', name: '추석 연휴' },
  { date: '2025-10-06', name: '추석' },
  { date: '2025-10-07', name: '추석 연휴' },
  { date: '2025-10-08', name: '추석 대체공휴일' },
  { date: '2025-10-09', name: '한글날' },
  { date: '2025-12-25', name: '성탄절' },

  // ── 2026 ──
  { date: '2026-01-01', name: '신정' },
  { date: '2026-02-16', name: '설날 연휴' },
  { date: '2026-02-17', name: '설날' },
  { date: '2026-02-18', name: '설날 연휴' },
  { date: '2026-03-01', name: '삼일절' },
  { date: '2026-03-02', name: '삼일절 대체공휴일' },
  { date: '2026-05-05', name: '어린이날' },
  { date: '2026-05-24', name: '부처님오신날' },
  { date: '2026-05-25', name: '부처님오신날 대체공휴일' },
  { date: '2026-06-06', name: '현충일' },
  { date: '2026-08-15', name: '광복절' },
  { date: '2026-08-17', name: '광복절 대체공휴일' },
  { date: '2026-09-24', name: '추석 연휴' },
  { date: '2026-09-25', name: '추석' },
  { date: '2026-09-26', name: '추석 연휴' },
  { date: '2026-09-28', name: '추석 대체공휴일' },
  { date: '2026-10-03', name: '개천절' },
  { date: '2026-10-05', name: '개천절 대체공휴일' },
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '성탄절' },

  // ── 2027 ──
  { date: '2027-01-01', name: '신정' },
  { date: '2027-02-06', name: '설날 연휴' },
  { date: '2027-02-07', name: '설날' },
  { date: '2027-02-08', name: '설날 연휴' },
  { date: '2027-02-09', name: '설날 대체공휴일' },
  { date: '2027-03-01', name: '삼일절' },
  { date: '2027-05-05', name: '어린이날' },
  { date: '2027-05-13', name: '부처님오신날' },
  { date: '2027-06-06', name: '현충일' },
  { date: '2027-08-15', name: '광복절' },
  { date: '2027-08-16', name: '광복절 대체공휴일' },
  { date: '2027-09-14', name: '추석 연휴' },
  { date: '2027-09-15', name: '추석' },
  { date: '2027-09-16', name: '추석 연휴' },
  { date: '2027-10-03', name: '개천절' },
  { date: '2027-10-04', name: '개천절 대체공휴일' },
  { date: '2027-10-09', name: '한글날' },
  { date: '2027-10-11', name: '한글날 대체공휴일' },
  { date: '2027-12-25', name: '성탄절' },
  { date: '2027-12-27', name: '성탄절 대체공휴일' },
];

async function seed() {
  let inserted = 0;
  for (const h of KR_HOLIDAYS) {
    const [r]: any = await pool.execute(
      `INSERT IGNORE INTO holidays (advertiser_id, holiday_date, name, day_type, is_system)
       VALUES (NULL, ?, ?, 'closed', 1)`,
      [h.date, h.name]
    );
    if (r.affectedRows) inserted++;
  }
  console.log(`[seed:holidays] 전체 ${KR_HOLIDAYS.length}건 중 신규 ${inserted}건 삽입 완료.`);
  await pool.end();
}

// 직접 실행 시에만 시드 수행
if (require.main === module) {
  seed().catch((e) => {
    console.error('[seed:holidays] 실패:', e);
    process.exit(1);
  });
}
