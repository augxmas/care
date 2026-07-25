import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { requireRole } from '../middleware/auth';

const router = Router();

// 정산은 관리자/담당자만
const guard = requireRole('advertiser', 'manager');

function advId(req: Request): number { return (req.session as any).advertiser.id; }

// ── 차원별 정의 (그리드 컬럼 순서 = 엑셀 컬럼 순서) ──────────
type Dim = {
  select: string;
  join: string;
  group: string;
  order: string;
  keyword?: (kw: string, params: any[]) => string; // WHERE 추가절
  columns: { header: string; key: string; width: number; money?: boolean }[];
  sheet: string;
  file: string;
};

const DIMS: Record<string, Dim> = {
  // 기간별 (월 단위 집계)
  period: {
    select: `DATE_FORMAT(cv.treated_at, '%Y-%m') AS period,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue`,
    join: '',
    group: `DATE_FORMAT(cv.treated_at, '%Y-%m')`,
    order: `period DESC`,
    columns: [
      { header: '기간(월)', key: 'period', width: 14 },
      { header: '결제건수', key: 'cnt', width: 12 },
      { header: '매출(원)', key: 'revenue', width: 18, money: true },
    ],
    sheet: '기간별 정산',
    file: 'settlement_period.xlsx',
  },
  // 유치기관별 (수수료율 기반 지급액 포함)
  recruiter: {
    select: `r.id AS recruiter_id,
             COALESCE(r.company_name, '(직접 유입)') AS company_name,
             r.business_no,
             r.commission_rate,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue,
             ROUND(SUM(cv.payment_amount) * COALESCE(r.commission_rate, 0) / 100) AS payable`,
    join: 'LEFT JOIN recruiters r ON r.id = cv.recruiter_id',
    group: `r.id`,
    order: `revenue DESC`,
    keyword: (kw, params) => { params.push(`%${kw}%`); return ' AND r.company_name LIKE ?'; },
    columns: [
      { header: '유치기관', key: 'company_name', width: 26 },
      { header: '사업자번호', key: 'business_no', width: 16 },
      { header: '수수료율(%)', key: 'commission_rate', width: 12 },
      { header: '결제건수', key: 'cnt', width: 10 },
      { header: '매출(원)', key: 'revenue', width: 16, money: true },
      { header: '지급액(원)', key: 'payable', width: 16, money: true },
    ],
    sheet: '유치기관별 정산',
    file: 'settlement_recruiter.xlsx',
  },
  // 고객별 (병원ID/이메일/이름 기준 그룹)
  customer: {
    select: `COALESCE(NULLIF(cv.hospital_patient_id, ''), NULLIF(cv.email, ''), cv.name) AS cust_key,
             MAX(cv.name) AS name,
             MAX(cv.hospital_patient_id) AS hospital_patient_id,
             MAX(cv.email) AS email,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue`,
    join: '',
    group: `COALESCE(NULLIF(cv.hospital_patient_id, ''), NULLIF(cv.email, ''), cv.name)`,
    order: `revenue DESC`,
    keyword: (kw, params) => {
      params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`);
      return ' AND (cv.name LIKE ? OR cv.hospital_patient_id LIKE ? OR cv.email LIKE ?)';
    },
    columns: [
      { header: '고객명', key: 'name', width: 16 },
      { header: '병원ID', key: 'hospital_patient_id', width: 14 },
      { header: '이메일', key: 'email', width: 24 },
      { header: '결제건수', key: 'cnt', width: 10 },
      { header: '매출(원)', key: 'revenue', width: 16, money: true },
    ],
    sheet: '고객별 정산',
    file: 'settlement_customer.xlsx',
  },
  // 결제수단별
  payment: {
    select: `COALESCE(NULLIF(cv.payment_method, ''), '(미지정)') AS payment_method,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue`,
    join: '',
    group: `COALESCE(NULLIF(cv.payment_method, ''), '(미지정)')`,
    order: `revenue DESC`,
    keyword: (kw, params) => { params.push(`%${kw}%`); return ' AND cv.payment_method LIKE ?'; },
    columns: [
      { header: '결제수단', key: 'payment_method', width: 18 },
      { header: '결제건수', key: 'cnt', width: 12 },
      { header: '매출(원)', key: 'revenue', width: 18, money: true },
    ],
    sheet: '결제수단별 정산',
    file: 'settlement_payment.xlsx',
  },
  // 국가별
  country: {
    select: `COALESCE(NULLIF(cv.nationality, ''), '(미지정)') AS nationality,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue`,
    join: '',
    group: `COALESCE(NULLIF(cv.nationality, ''), '(미지정)')`,
    order: `revenue DESC`,
    keyword: (kw, params) => { params.push(`%${kw}%`); return ' AND cv.nationality LIKE ?'; },
    columns: [
      { header: '국가', key: 'nationality', width: 16 },
      { header: '결제건수', key: 'cnt', width: 12 },
      { header: '매출(원)', key: 'revenue', width: 18, money: true },
    ],
    sheet: '국가별 정산',
    file: 'settlement_country.xlsx',
  },
  // 의사별
  doctor: {
    select: `d.id AS doctor_id,
             d.name AS doctor_name,
             d.specialty,
             COUNT(*) AS cnt,
             SUM(cv.payment_amount) AS revenue`,
    join: 'LEFT JOIN doctors d ON d.id = cv.doctor_id',
    group: `d.id`,
    order: `revenue DESC`,
    keyword: (kw, params) => { params.push(`%${kw}%`); return ' AND d.name LIKE ?'; },
    columns: [
      { header: '의사명', key: 'doctor_name', width: 16 },
      { header: '진료과목', key: 'specialty', width: 20 },
      { header: '결제건수', key: 'cnt', width: 10 },
      { header: '매출(원)', key: 'revenue', width: 16, money: true },
    ],
    sheet: '의사별 정산',
    file: 'settlement_doctor.xlsx',
  },
};

// 공통 WHERE + 파라미터 (매출 = 결제완료 고객 결제금액)
function buildWhere(dim: Dim, adv: number, req: Request): { where: string; params: any[] } {
  let where = `WHERE c.advertiser_id = ?
                 AND cv.visit_type = 'treated'
                 AND cv.payment_amount IS NOT NULL AND cv.payment_amount > 0`;
  const params: any[] = [adv];
  const from = req.query.from_date ? String(req.query.from_date).slice(0, 10) : '';
  const to   = req.query.to_date   ? String(req.query.to_date).slice(0, 10)   : '';
  if (from) { where += ' AND DATE(cv.treated_at) >= ?'; params.push(from); }
  if (to)   { where += ' AND DATE(cv.treated_at) <= ?'; params.push(to); }
  const kw = req.query.keyword ? String(req.query.keyword).trim() : '';
  if (kw && dim.keyword) where += dim.keyword(kw, params);
  return { where, params };
}

async function runList(dimKey: string, req: Request, res: Response) {
  const dim = DIMS[dimKey];
  const adv = advId(req);
  const { where, params } = buildWhere(dim, adv, req);
  const base = `FROM customer_visits cv
                INNER JOIN campaigns c ON c.id = cv.campaign_id
                ${dim.join}
                ${where}`;
  const page = Math.max(1, parseInt(String(req.query.page || '1')));
  const size = Math.min(1000, Math.max(1, parseInt(String(req.query.size || '20'))));
  const offset = (page - 1) * size;

  const [cntRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total FROM (SELECT 1 ${base} GROUP BY ${dim.group}) t`, params
  );
  const total = cntRows[0].total;
  const [data] = await pool.execute<any[]>(
    `SELECT ${dim.select} ${base} GROUP BY ${dim.group} ORDER BY ${dim.order} LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  res.json({ ok: true, data, total });
}

async function runExcel(dimKey: string, req: Request, res: Response) {
  const dim = DIMS[dimKey];
  const adv = advId(req);
  const { where, params } = buildWhere(dim, adv, req);
  const base = `FROM customer_visits cv
                INNER JOIN campaigns c ON c.id = cv.campaign_id
                ${dim.join}
                ${where}`;
  // 조회결과 전체 (페이지 무관)
  const [rows] = await pool.execute<any[]>(
    `SELECT ${dim.select} ${base} GROUP BY ${dim.group} ORDER BY ${dim.order}`, params
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(dim.sheet);
  ws.columns = dim.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const row: any = {};
    for (const c of dim.columns) {
      let v = r[c.key];
      if (c.money) v = v == null ? 0 : Number(v);
      row[c.key] = v == null ? '' : v;
    }
    ws.addRow(row);
  }
  // 합계 행 (금액 컬럼)
  if (rows.length) {
    const totalRow: any = {};
    const firstKey = dim.columns[0].key;
    totalRow[firstKey] = '합계';
    for (const c of dim.columns) {
      if (c.money) totalRow[c.key] = rows.reduce((s, r) => s + Number(r[c.key] || 0), 0);
      else if (c.key === 'cnt') totalRow[c.key] = rows.reduce((s, r) => s + Number(r.cnt || 0), 0);
    }
    const added = ws.addRow(totalRow);
    added.font = { bold: true };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${dim.file}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ── 정산 대시보드 (이번달 기준) ─────────────────────────────
router.get('/dashboard', guard, async (req: Request, res: Response) => {
  const adv = advId(req);
  const base = `FROM customer_visits cv
                INNER JOIN campaigns c ON c.id = cv.campaign_id`;
  const monthWhere = `WHERE c.advertiser_id = ?
                        AND cv.visit_type = 'treated'
                        AND cv.payment_amount IS NOT NULL AND cv.payment_amount > 0
                        AND DATE_FORMAT(cv.treated_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')`;

  // 이번달 매출 합계
  const [rev] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(cv.payment_amount),0) AS revenue ${base} ${monthWhere}`, [adv]);

  // 수수료 줘야할 상위 5개 위탁기관 (지급액 = 매출×수수료율%)
  const [recs] = await pool.execute<any[]>(
    `SELECT r.company_name AS name,
            ROUND(SUM(cv.payment_amount) * COALESCE(r.commission_rate,0) / 100) AS payable
       ${base}
       INNER JOIN recruiters r ON r.id = cv.recruiter_id
       ${monthWhere}
       GROUP BY r.id HAVING payable > 0 ORDER BY payable DESC LIMIT 5`, [adv]);

  // 국가별 매출
  const [country] = await pool.execute<any[]>(
    `SELECT COALESCE(NULLIF(cv.nationality,''),'(미지정)') AS name, SUM(cv.payment_amount) AS revenue
       ${base} ${monthWhere} GROUP BY COALESCE(NULLIF(cv.nationality,''),'(미지정)') ORDER BY revenue DESC`, [adv]);

  // 의사별 매출
  const [doctor] = await pool.execute<any[]>(
    `SELECT COALESCE(d.name,'(미지정)') AS name, SUM(cv.payment_amount) AS revenue
       ${base} LEFT JOIN doctors d ON d.id = cv.doctor_id
       ${monthWhere} GROUP BY d.id ORDER BY revenue DESC`, [adv]);

  // 결제수단별 매출
  const [payment] = await pool.execute<any[]>(
    `SELECT COALESCE(NULLIF(cv.payment_method,''),'(미지정)') AS name, SUM(cv.payment_amount) AS revenue
       ${base} ${monthWhere} GROUP BY COALESCE(NULLIF(cv.payment_method,''),'(미지정)') ORDER BY revenue DESC`, [adv]);

  const mapNum = (rows: any[], key: string) => rows.map(r => ({ name: r.name, value: Number(r[key]) || 0 }));
  res.json({
    ok: true,
    month_revenue: Number(rev[0].revenue) || 0,
    top_recruiters: mapNum(recs, 'payable'),
    by_country: mapNum(country, 'revenue'),
    by_doctor: mapNum(doctor, 'revenue'),
    by_payment: mapNum(payment, 'revenue'),
  });
});

// 라우트 등록
for (const key of Object.keys(DIMS)) {
  router.get(`/${key}`, guard, (req, res) => runList(key, req, res).catch((e) => { console.error(e); res.status(500).json({ error: '조회에 실패했습니다.' }); }));
  router.get(`/${key}/excel`, guard, (req, res) => runExcel(key, req, res).catch((e) => { console.error(e); res.status(500).json({ error: '엑셀 생성에 실패했습니다.' }); }));
}

export default router;
