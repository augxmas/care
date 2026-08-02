import Anthropic from '@anthropic-ai/sdk';
import pool from '../config/database';
import { getHolidayMap } from '../utils/holidays';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const client = HAS_KEY ? new Anthropic() : (null as any); // 키 없으면 LLM 기능 비활성(원문 그대로)

export type LlmUsageRow = {
  advertiserId: number;
  actorType: 'manager' | 'doctor' | 'advertiser' | 'system';
  actorId?: number | null;
  conversationId?: number | null;
  customerEmail?: string | null;
  purpose: 'system_chat' | 'translate';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  requestId?: string | null;
};

export async function recordUsage(u: LlmUsageRow): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO llm_usage
        (advertiser_id, actor_type, actor_id, conversation_id, customer_email, purpose,
         model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, request_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [u.advertiserId, u.actorType, u.actorId ?? null, u.conversationId ?? null, u.customerEmail ?? null,
       u.purpose, MODEL, u.inputTokens, u.outputTokens, u.cacheReadTokens ?? 0, u.cacheWriteTokens ?? 0, u.requestId ?? null]
    );
  } catch (e) { console.error('[llm] usage 기록 실패', (e as any)?.message); }
}

// 간단 언어 추정 (번역 호출 스킵용)
function quickLang(text: string): string | null {
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/^[\x00-\x7f\s]+$/.test(text)) return 'en';
  return null;
}

// ── 번역 ───────────────────────────────────────────────────
// 수신자 언어로 번역. 동일언어/키없음이면 번역 스킵(원문만).
export async function translate(
  text: string,
  targetLang: string,
  ctx: { advertiserId: number; conversationId?: number; actorType: LlmUsageRow['actorType']; actorId?: number | null; customerEmail?: string | null }
): Promise<{ translatedText: string | null; detectedLang: string | null }> {
  const t = (text || '').trim();
  if (!t || !HAS_KEY) return { translatedText: null, detectedLang: quickLang(t) };
  const guess = quickLang(t);
  if (guess && guess === targetLang) return { translatedText: null, detectedLang: guess }; // 동일언어 스킵

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              detected_lang: { type: 'string', description: 'BCP-47 language code of the input' },
              translation: { type: 'string', description: `the input translated into ${targetLang}` },
            },
            required: ['detected_lang', 'translation'],
            additionalProperties: false,
          },
        },
      },
      system: `You translate chat messages for a hospital consultation. Detect the source language and translate the user's message into the target language "${targetLang}". Preserve meaning and tone; do not add notes. Return only the structured JSON.`,
      messages: [{ role: 'user', content: t }],
    });
    await recordUsage({
      advertiserId: ctx.advertiserId, actorType: ctx.actorType, actorId: ctx.actorId,
      conversationId: ctx.conversationId, customerEmail: ctx.customerEmail, purpose: 'translate',
      inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens,
      cacheReadTokens: (resp.usage as any).cache_read_input_tokens || 0,
      cacheWriteTokens: (resp.usage as any).cache_creation_input_tokens || 0,
      requestId: (resp as any)._request_id || resp.id,
    });
    const textBlock: any = resp.content.find((b: any) => b.type === 'text');
    let parsed: any = {};
    try { parsed = JSON.parse(textBlock?.text || '{}'); } catch { parsed = {}; }
    const detected = parsed.detected_lang || guess;
    if (detected && detected.slice(0, 2) === targetLang.slice(0, 2)) return { translatedText: null, detectedLang: detected };
    return { translatedText: parsed.translation || null, detectedLang: detected };
  } catch (e) {
    console.error('[llm] 번역 실패', (e as any)?.message);
    return { translatedText: null, detectedLang: guess };
  }
}

export async function translateNotice(
  title: string,
  contentHtml: string,
  targetLang: string,
  ctx: { advertiserId: number; actorType: LlmUsageRow['actorType']; actorId?: number | null },
): Promise<{ title: string; content: string } | null> {
  if (!HAS_KEY || !title.trim()) return null;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content_html: { type: 'string' },
            },
            required: ['title', 'content_html'],
            additionalProperties: false,
          },
        },
      },
      system: `Translate a hospital notice from Korean into language code "${targetLang}". Preserve every HTML tag, attribute, URL, image, list, and formatting structure in content_html; translate only human-readable text. Do not add claims, explanations, or new markup. Return only the structured JSON.`,
      messages: [{ role: 'user', content: JSON.stringify({ title, content_html: contentHtml }) }],
    });
    await recordUsage({
      advertiserId: ctx.advertiserId, actorType: ctx.actorType, actorId: ctx.actorId,
      purpose: 'translate', inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens,
      cacheReadTokens: (resp.usage as any).cache_read_input_tokens || 0,
      cacheWriteTokens: (resp.usage as any).cache_creation_input_tokens || 0,
      requestId: (resp as any)._request_id || resp.id,
    });
    const textBlock: any = resp.content.find((block: any) => block.type === 'text');
    const parsed = JSON.parse(textBlock?.text || '{}');
    if (!parsed.title || typeof parsed.content_html !== 'string') return null;
    return { title: String(parsed.title), content: String(parsed.content_html) };
  } catch (e) {
    console.error('[llm] 공지사항 번역 실패', (e as any)?.message);
    return null;
  }
}

// ── 시스템 채팅 (tool-use) ──────────────────────────────────
const TOOLS = [
  {
    name: 'find_available_doctors',
    description: '특정 날짜/시각에 이 병원에서 예약 가능한(겹치는 일정 없음, 부재중 아님, 휴무일 아님) 의사를 조회한다. 예약 가능 의사·시간을 물으면 반드시 호출.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM (24h)' },
        duration_min: { type: 'integer', description: '진료 길이(분), 기본 30' },
      },
      required: ['date', 'time'],
    },
  },
  {
    name: 'create_appointment',
    description: 'CRM 내부 일정관리 기능으로 고객 예약을 생성한다. 고객 이름/이메일, 의사명, 날짜, 시작시간을 내부 DB에서 확인하고 충돌이 없을 때 appointments에 예약을 등록한다.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: '고객명. 예: 송유진' },
        customer_email: { type: 'string', description: '고객 이메일. 예: nitsuser@naver.com' },
        doctor_name: { type: 'string', description: '의사명. 예: 이서연' },
        date: { type: 'string', description: '예약일 YYYY-MM-DD' },
        time: { type: 'string', description: '시작시간 HH:MM (24h)' },
        duration_min: { type: 'integer', description: '예약 길이(분). 없으면 30분' },
        status: { type: 'string', enum: ['consulting', 'operating'], description: "예약유형. 사용자가 '수술', '시술', '오퍼', 'operation', 'surgery'라고 하면 반드시 operating. '진료', '상담'이면 consulting. 없으면 consulting" },
        note: { type: 'string', description: '일정 메모' },
      },
      required: ['customer_email', 'doctor_name', 'date', 'time'],
    },
  },
  {
    name: 'find_customer_appointments',
    description: 'CRM 내부 일정관리에서 특정 고객의 기존 예약 일정을 조회한다. 고객명, 이메일, 병원ID 중 가능한 조건으로 customer_visits/customers/appointments를 조회한다.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: '고객명. 예: 송유진' },
        customer_email: { type: 'string', description: '고객 이메일. 예: nitsuser@naver.com' },
        hospital_patient_id: { type: 'string', description: '병원ID/환자일련번호. 예: P2026-1037' },
        from_date: { type: 'string', description: '조회 시작일 YYYY-MM-DD. 없으면 제한 없음' },
        to_date: { type: 'string', description: '조회 종료일 YYYY-MM-DD. 없으면 제한 없음' },
        include_past: { type: 'boolean', description: '지난 예약 포함 여부. 기본 true' },
      },
      required: [],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'CRM 내부 일정관리에서 기존 예약을 변경한다. 기존 예약은 수정하지 않고 취소(is_deleted=1) 처리한 뒤 새 appointments 레코드를 생성한다.',
    input_schema: {
      type: 'object',
      properties: {
        appointment_id: { type: 'integer', description: '기존 예약 ID. 있으면 가장 정확하게 이 예약을 변경한다.' },
        customer_name: { type: 'string', description: '예약 고객명. appointment_id가 없을 때 고객 예약 검색에 사용' },
        customer_email: { type: 'string', description: '예약 고객 이메일. appointment_id가 없을 때 고객 예약 검색에 사용' },
        hospital_patient_id: { type: 'string', description: '병원ID. appointment_id가 없을 때 고객 예약 검색에 사용' },
        old_date: { type: 'string', description: '기존 예약일 YYYY-MM-DD. appointment_id가 없을 때 대상 예약을 좁히는 데 사용' },
        old_time: { type: 'string', description: '기존 예약 시작시간 HH:MM. appointment_id가 없을 때 대상 예약을 좁히는 데 사용' },
        doctor_name: { type: 'string', description: '새 예약 의사명. 없으면 기존 예약 의사를 유지' },
        date: { type: 'string', description: '새 예약일 YYYY-MM-DD' },
        time: { type: 'string', description: '새 시작시간 HH:MM (24h)' },
        duration_min: { type: 'integer', description: '새 예약 길이(분). 없으면 기존 예약 길이, 기존 길이를 알 수 없으면 30분' },
        status: { type: 'string', enum: ['consulting', 'operating'], description: "예약유형. 사용자가 '수술', '시술', '오퍼', 'operation', 'surgery'라고 하면 반드시 operating. '진료', '상담'이면 consulting. 없으면 기존 예약 상태 유지" },
        note: { type: 'string', description: '새 일정 메모' },
      },
      required: ['date', 'time'],
    },
  },
];

const CRM_FEATURES = [
  '캠페인: 이미지/HTML/YouTube 광고 캠페인 등록, 견적/입금/광고중/종료/취소 상태 관리, 광고 기간과 비용 관리, 수집항목 설정, 캠페인 이미지/폼 URL 제공',
  '고객정보: 캠페인별/고객별 유입 고객 조회, 병원ID/노트 편집, 시술여부/시술일시/담당 의사/담당자/결제정보/국적/성별/생년월일/연락처 관리',
  '스탭: 의사/담당자 등록과 수정, 담당 고객/시술 이력 조회, 스탭별 고객 방문 집계',
  '유치업자: 유치기관 등록과 캠페인/고객 유입 연결',
  '문진: 문진 생성/수정/복사/활성화/비활성화, 개인정보 수집 동의, 응답 고객 조회와 통계',
  '일정관리: 의사별 진료/수술/부재 일정 등록, 고객 선택, 공휴일/휴무일 반영, 고객 일정 안내 메일, 고객용 일정 조회',
  '정산: 캠페인별/유치업자별/고객별 결제완료 매출 집계와 엑셀 다운로드',
  '상담/채팅: 고객 온라인 상담, 담당자/의사 배정, 답변 메일, 실시간 채팅, 고객 국적 기반 자동 번역, 원문+번역 표시, 읽음 상태, 파일 첨부, @시스템 내부 어시스턴트',
  '공지사항/동영상: 병원 내부 공지와 콘텐츠 동영상 관리',
  '이메일: 템플릿 기반 발송, 예약/상담/회원/캠페인 알림, 발송 로그 조회',
  '보안/계정: 광고주/스탭/고객 로그인, 역할별 접근 제어, 고객 임시 비밀번호와 비밀번호 변경',
].join('\n- ');

function pad(n: number) { return String(n).padStart(2, '0'); }
function weekdayKo(date: string): string {
  return ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(`${date}T00:00:00+09:00`).getDay()];
}
function dt(date: string, time: string): string { return `${date} ${time}:00`; }
function addMinutes(date: string, time: string, durationMin: number): string {
  const [h, m] = time.split(':').map(Number);
  const end = h * 60 + m + durationMin;
  return `${date} ${pad(Math.floor(end / 60))}:${pad(end % 60)}:00`;
}
function inferAppointmentStatusFromText(...values: any[]): 'consulting' | 'operating' | null {
  const text = values
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  if (!text) return null;
  if (/(수술|시술|오퍼|수술실|operation|operating|surgery|procedure)/i.test(text)) return 'operating';
  if (/(진료|상담|consulting|consultation)/i.test(text)) return 'consulting';
  return null;
}
function lastUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('\n');
    }
  }
  return '';
}

async function findAvailableDoctors(adv: number, date: string, time: string, durationMin: number) {
  const map = await getHolidayMap(adv, date, date);
  const eff = map[date];
  if (eff && eff.effective_type === 'closed') return { closed: true, name: eff.name, doctors: [] };
  const start = `${date} ${time}:00`;
  const [h, m] = time.split(':').map(Number);
  const endMin = h * 60 + m + (durationMin || 30);
  const end = `${date} ${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
  const [rows] = await pool.execute<any[]>(
    `SELECT d.id, d.name, d.specialty FROM doctors d
      WHERE d.advertiser_id=? AND d.is_deleted=0 AND d.status='active'
        AND NOT EXISTS (
          SELECT 1 FROM appointments ap
           WHERE ap.doctor_id=d.id AND ap.is_deleted=0
             AND ap.start_at < ? AND ap.end_at > ?)
      ORDER BY d.name`,
    [adv, end, start]
  );
  return { closed: false, doctors: rows };
}

async function createAppointment(
  adv: number,
  actor: { type: 'manager' | 'doctor' | 'advertiser'; id?: number | null },
  input: any
) {
  const email = String(input.customer_email || '').trim();
  const customerName = String(input.customer_name || '').trim();
  const doctorName = String(input.doctor_name || '').trim();
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();
  const durationMin = Math.max(5, Math.min(480, Number(input.duration_min) || 30));
  const inferredStatus = inferAppointmentStatusFromText(input._user_text, input.note, input.status);
  const status = inferredStatus || (input.status === 'operating' ? 'operating' : 'consulting');
  const note = input.note ? String(input.note).slice(0, 1000) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { ok: false, error: 'date는 YYYY-MM-DD, time은 HH:MM 형식이어야 합니다.' };
  }
  const start = dt(date, time);
  const end = addMinutes(date, time, durationMin);
  const [pastRows] = await pool.execute<any[]>('SELECT (? < NOW()) AS past', [start]);
  if (pastRows[0]?.past) return { ok: false, error: '지난 시간대에는 예약을 등록할 수 없습니다.' };

  const [doctors] = await pool.execute<any[]>(
    `SELECT id, name, specialty FROM doctors
      WHERE advertiser_id=? AND is_deleted=0 AND status='active' AND name=?
      ORDER BY id LIMIT 2`,
    [adv, doctorName]);
  if (!doctors.length) return { ok: false, error: `의사 '${doctorName}'을(를) 찾을 수 없습니다.` };
  if (doctors.length > 1) return { ok: false, error: `의사 '${doctorName}'이(가) 여러 명입니다. 더 구체적으로 지정해 주세요.` };
  const doctor = doctors[0];

  const [visits] = await pool.execute<any[]>(
    `SELECT cv.id, cv.name, cv.email, cv.mobile, cv.hospital_patient_id,
            (SELECT cu.id FROM customers cu WHERE cu.advertiser_id=? AND cu.email=cv.email AND cu.is_deleted=0 LIMIT 1) AS customer_id
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
      WHERE c.advertiser_id=? AND cv.email=? ${customerName ? 'AND cv.name=?' : ''}
      ORDER BY cv.visited_at DESC LIMIT 2`,
    customerName ? [adv, adv, email, customerName] : [adv, adv, email]);
  if (!visits.length) return { ok: false, error: `고객 '${customerName || email}'을(를) 찾을 수 없습니다.` };
  const visit = visits[0];

  const map = await getHolidayMap(adv, date, date);
  const eff = map[date];
  if (eff && eff.effective_type === 'closed') {
    return { ok: false, error: `휴무일(${eff.name || ''})에는 예약을 등록할 수 없습니다.` };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [overlap] = await conn.execute<any[]>(
      `SELECT id, status FROM appointments
        WHERE doctor_id=? AND is_deleted=0 AND start_at < ? AND end_at > ?
        FOR UPDATE`,
      [doctor.id, end, start]);
    if (overlap.length) {
      await conn.rollback();
      return { ok: false, error: '해당 시간에 이미 다른 일정 또는 부재중 일정이 있습니다.' };
    }
    const actorLabel = actor.type === 'doctor' ? `의사#${actor.id}` : actor.type === 'manager' ? `담당자#${actor.id}` : `관리자#${actor.id}`;
    const [ins]: any = await conn.execute(
      `INSERT INTO appointments
        (advertiser_id, doctor_id, manager_id, customer_id, visit_id, status, title, start_at, end_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adv,
        doctor.id,
        actor.type === 'manager' ? actor.id || null : null,
        visit.customer_id || null,
        visit.id,
        status,
        `${visit.name || customerName || email} 예약`,
        start,
        end,
        note,
        `@시스템 ${actorLabel}`,
      ]);
    await conn.commit();
    return {
      ok: true,
      appointment_id: ins.insertId,
      date,
      weekday: weekdayKo(date),
      start_at: start,
      end_at: end,
      status,
      doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty },
      customer: { visit_id: visit.id, customer_id: visit.customer_id || null, name: visit.name, email: visit.email, hospital_patient_id: visit.hospital_patient_id },
      notified: false,
      notice: '예약은 생성됐습니다. 현재 @시스템 예약 생성은 고객 안내 메일 발송까지는 수행하지 않습니다.',
    };
  } catch (e) {
    await conn.rollback();
    return { ok: false, error: '예약 저장 중 오류가 발생했습니다.' };
  } finally {
    conn.release();
  }
}

async function findCustomerAppointments(adv: number, input: any) {
  const email = String(input.customer_email || '').trim();
  const customerName = String(input.customer_name || '').trim();
  const hpid = String(input.hospital_patient_id || '').trim();
  const fromDate = String(input.from_date || '').trim();
  const toDate = String(input.to_date || '').trim();
  const includePast = input.include_past !== false;
  if (!email && !customerName && !hpid) {
    return { ok: false, error: '고객명, 이메일, 병원ID 중 하나가 필요합니다.' };
  }
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return { ok: false, error: 'from_date는 YYYY-MM-DD 형식이어야 합니다.' };
  if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return { ok: false, error: 'to_date는 YYYY-MM-DD 형식이어야 합니다.' };

  const conds: string[] = [];
  const params: any[] = [adv];
  if (email) { conds.push('cv.email = ?'); params.push(email); }
  if (customerName) { conds.push('cv.name = ?'); params.push(customerName); }
  if (hpid) { conds.push('cv.hospital_patient_id = ?'); params.push(hpid); }
  const [visits] = await pool.execute<any[]>(
    `SELECT cv.id AS visit_id, cv.name, cv.email, cv.hospital_patient_id,
            (SELECT cu.id FROM customers cu WHERE cu.advertiser_id=? AND cu.email=cv.email AND cu.is_deleted=0 LIMIT 1) AS customer_id
       FROM customer_visits cv INNER JOIN campaigns c ON c.id=cv.campaign_id
      WHERE c.advertiser_id=? AND (${conds.join(' OR ')})
      ORDER BY cv.visited_at DESC LIMIT 20`,
    [adv, ...params]);
  if (!visits.length) return { ok: false, error: '조건에 맞는 고객을 찾을 수 없습니다.' };

  const emails = [...new Set(visits.map((v) => v.email).filter(Boolean))];
  const hpids = [...new Set(visits.map((v) => v.hospital_patient_id).filter(Boolean))];
  const customerIds = [...new Set(visits.map((v) => v.customer_id).filter(Boolean))];
  const visitIds = [...new Set(visits.map((v) => v.visit_id).filter(Boolean))];

  const apConds: string[] = ['ap.advertiser_id=?', 'ap.is_deleted=0', "ap.status<>'absent'"];
  const apParams: any[] = [adv];
  const matchConds: string[] = [];
  if (customerIds.length) { matchConds.push(`ap.customer_id IN (${customerIds.map(() => '?').join(',')})`); apParams.push(...customerIds); }
  if (visitIds.length) { matchConds.push(`ap.visit_id IN (${visitIds.map(() => '?').join(',')})`); apParams.push(...visitIds); }
  if (emails.length) { matchConds.push(`cv.email IN (${emails.map(() => '?').join(',')})`); apParams.push(...emails); }
  if (hpids.length) { matchConds.push(`cv.hospital_patient_id IN (${hpids.map(() => '?').join(',')})`); apParams.push(...hpids); }
  apConds.push(`(${matchConds.join(' OR ')})`);
  if (!includePast) apConds.push('ap.end_at >= NOW()');
  if (fromDate) { apConds.push('DATE(ap.start_at) >= ?'); apParams.push(fromDate); }
  if (toDate) { apConds.push('DATE(ap.start_at) <= ?'); apParams.push(toDate); }

  const [appointments] = await pool.execute<any[]>(
    `SELECT ap.id, ap.status, ap.title,
            DATE_FORMAT(ap.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(ap.end_at, '%Y-%m-%d %H:%i:%s') AS end_at,
            d.name AS doctor_name, d.specialty AS doctor_specialty,
            m.name AS manager_name,
            cv.name AS customer_name, cv.email AS customer_email, cv.hospital_patient_id
       FROM appointments ap
       LEFT JOIN doctors d ON d.id=ap.doctor_id
       LEFT JOIN managers m ON m.id=ap.manager_id
       LEFT JOIN customer_visits cv ON cv.id=ap.visit_id
      WHERE ${apConds.join(' AND ')}
      ORDER BY ap.start_at DESC
      LIMIT 50`,
    apParams);

  return {
    ok: true,
    matched_customers: visits.map((v) => ({ visit_id: v.visit_id, customer_id: v.customer_id || null, name: v.name, email: v.email, hospital_patient_id: v.hospital_patient_id })),
    count: appointments.length,
    appointments: appointments.map((ap) => ({
      ...ap,
      weekday: weekdayKo(String(ap.start_at).slice(0, 10)),
    })),
  };
}

async function rescheduleAppointment(
  adv: number,
  actor: { type: 'manager' | 'doctor' | 'advertiser'; id?: number | null },
  input: any
) {
  const appointmentId = input.appointment_id ? Number(input.appointment_id) : null;
  const email = String(input.customer_email || '').trim();
  const customerName = String(input.customer_name || '').trim();
  const hpid = String(input.hospital_patient_id || '').trim();
  const oldDate = String(input.old_date || '').trim();
  const oldTime = String(input.old_time || '').trim();
  const newDate = String(input.date || '').trim();
  const newTime = String(input.time || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
    return { ok: false, error: '새 예약 date는 YYYY-MM-DD, time은 HH:MM 형식이어야 합니다.' };
  }

  const targetConds = ['ap.advertiser_id=?', 'ap.is_deleted=0', "ap.status<>'absent'"];
  const targetParams: any[] = [adv];
  if (appointmentId) {
    targetConds.push('ap.id=?');
    targetParams.push(appointmentId);
  } else {
    const custConds: string[] = [];
    if (email) { custConds.push('cv.email=?'); targetParams.push(email); }
    if (customerName) { custConds.push('cv.name=?'); targetParams.push(customerName); }
    if (hpid) { custConds.push('cv.hospital_patient_id=?'); targetParams.push(hpid); }
    if (!custConds.length) return { ok: false, error: 'appointment_id가 없으면 고객명, 이메일, 병원ID 중 하나가 필요합니다.' };
    targetConds.push(`(${custConds.join(' OR ')})`);
    if (oldDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(oldDate)) return { ok: false, error: 'old_date는 YYYY-MM-DD 형식이어야 합니다.' };
      targetConds.push('DATE(ap.start_at)=?');
      targetParams.push(oldDate);
    }
    if (oldTime) {
      if (!/^\d{2}:\d{2}$/.test(oldTime)) return { ok: false, error: 'old_time은 HH:MM 형식이어야 합니다.' };
      targetConds.push("DATE_FORMAT(ap.start_at, '%H:%i')=?");
      targetParams.push(oldTime);
    }
  }

  const [targets] = await pool.execute<any[]>(
    `SELECT ap.id, ap.doctor_id, ap.manager_id, ap.customer_id, ap.visit_id, ap.status, ap.title, ap.note,
            DATE_FORMAT(ap.start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(ap.end_at, '%Y-%m-%d %H:%i:%s') AS end_at,
            d.name AS doctor_name,
            cv.name AS customer_name, cv.email AS customer_email, cv.hospital_patient_id
       FROM appointments ap
       LEFT JOIN doctors d ON d.id=ap.doctor_id
       LEFT JOIN customer_visits cv ON cv.id=ap.visit_id
      WHERE ${targetConds.join(' AND ')}
      ORDER BY ap.start_at DESC
      LIMIT 5`,
    targetParams);
  if (!targets.length) return { ok: false, error: '변경할 기존 예약을 찾을 수 없습니다.' };
  if (targets.length > 1) {
    return {
      ok: false,
      error: '변경 대상 예약이 여러 건입니다. appointment_id 또는 기존 예약일/시간을 더 구체적으로 지정해 주세요.',
      candidates: targets.map((t) => ({
        appointment_id: t.id,
        start_at: t.start_at,
        end_at: t.end_at,
        doctor_name: t.doctor_name,
        customer_name: t.customer_name,
        customer_email: t.customer_email,
      })),
    };
  }
  const old = targets[0];
  const oldStart = String(old.start_at);
  const oldEnd = String(old.end_at);
  const oldDurationMin = Math.max(5, Math.round((new Date(oldEnd.replace(' ', 'T') + '+09:00').getTime() - new Date(oldStart.replace(' ', 'T') + '+09:00').getTime()) / 60000) || 30);
  const durationMin = Math.max(5, Math.min(480, Number(input.duration_min) || oldDurationMin || 30));
  const start = dt(newDate, newTime);
  const end = addMinutes(newDate, newTime, durationMin);
  const [pastRows] = await pool.execute<any[]>('SELECT (? < NOW()) AS new_past, (? < NOW()) AS old_past', [start, old.start_at]);
  if (pastRows[0]?.new_past) return { ok: false, error: '지난 시간대로는 예약을 변경할 수 없습니다.' };
  if (pastRows[0]?.old_past) return { ok: false, error: '지난 기존 예약은 AI 기능으로 취소/변경할 수 없습니다.' };

  const doctorName = String(input.doctor_name || old.doctor_name || '').trim();
  const [doctors] = await pool.execute<any[]>(
    `SELECT id, name, specialty FROM doctors
      WHERE advertiser_id=? AND is_deleted=0 AND status='active' AND name=?
      ORDER BY id LIMIT 2`,
    [adv, doctorName]);
  if (!doctors.length) return { ok: false, error: `의사 '${doctorName}'을(를) 찾을 수 없습니다.` };
  if (doctors.length > 1) return { ok: false, error: `의사 '${doctorName}'이(가) 여러 명입니다. 더 구체적으로 지정해 주세요.` };
  const doctor = doctors[0];

  const inferredStatus = inferAppointmentStatusFromText(input._user_text, input.note, input.status);
  const status = inferredStatus || (input.status === 'operating' ? 'operating' : (old.status === 'operating' ? 'operating' : 'consulting'));
  const note = input.note !== undefined ? (input.note ? String(input.note).slice(0, 1000) : null) : old.note;
  const map = await getHolidayMap(adv, newDate, newDate);
  const eff = map[newDate];
  if (eff && eff.effective_type === 'closed') return { ok: false, error: `휴무일(${eff.name || ''})에는 예약을 변경할 수 없습니다.` };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [cur] = await conn.execute<any[]>(
      `SELECT id FROM appointments WHERE id=? AND advertiser_id=? AND is_deleted=0 FOR UPDATE`,
      [old.id, adv]);
    if (!cur.length) {
      await conn.rollback();
      return { ok: false, error: '기존 예약이 이미 취소되었거나 찾을 수 없습니다.' };
    }
    const [overlap] = await conn.execute<any[]>(
      `SELECT id, status FROM appointments
        WHERE doctor_id=? AND is_deleted=0 AND id<>? AND start_at < ? AND end_at > ?
        FOR UPDATE`,
      [doctor.id, old.id, end, start]);
    if (overlap.length) {
      await conn.rollback();
      return { ok: false, error: '새 예약 시간에 이미 다른 일정 또는 부재중 일정이 있습니다.' };
    }
    const actorLabel = actor.type === 'doctor' ? `의사#${actor.id}` : actor.type === 'manager' ? `담당자#${actor.id}` : `관리자#${actor.id}`;
    await conn.execute(
      `UPDATE appointments SET is_deleted=1, deleted_at=NOW(), deleted_by=?
        WHERE id=? AND advertiser_id=? AND is_deleted=0`,
      [`@시스템 변경 ${actorLabel}`, old.id, adv]);
    const [ins]: any = await conn.execute(
      `INSERT INTO appointments
        (advertiser_id, doctor_id, manager_id, customer_id, visit_id, status, title, start_at, end_at, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adv,
        doctor.id,
        actor.type === 'manager' ? actor.id || null : old.manager_id || null,
        old.customer_id || null,
        old.visit_id,
        status,
        old.title || `${old.customer_name || old.customer_email || '고객'} 예약`,
        start,
        end,
        note,
        `@시스템 변경 ${actorLabel}`,
      ]);
    await conn.commit();
    return {
      ok: true,
      cancelled_appointment_id: old.id,
      new_appointment_id: ins.insertId,
      old_start_at: old.start_at,
      old_end_at: old.end_at,
      new_start_at: start,
      new_end_at: end,
      new_weekday: weekdayKo(newDate),
      status,
      doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty },
      customer: { name: old.customer_name, email: old.customer_email, hospital_patient_id: old.hospital_patient_id },
      notice: '기존 예약은 취소 처리하고 새 예약을 생성했습니다. 현재 @시스템 변경은 고객 안내 메일 발송까지는 수행하지 않습니다.',
    };
  } catch (e) {
    await conn.rollback();
    return { ok: false, error: '예약 변경 저장 중 오류가 발생했습니다.' };
  } finally {
    conn.release();
  }
}

// 스탭 시스템 채팅 1턴. messages=대화기록. 합산 usage를 llm_usage 1행으로 기록.
export async function systemChat(
  adv: number,
  actor: { type: 'manager' | 'doctor' | 'advertiser'; id?: number | null; lang?: string },
  conversationKey: number | null,
  messages: any[],
  todayStr: string
): Promise<{ answer: string; usable: boolean }> {
  if (!HAS_KEY) return { answer: 'LLM이 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청하세요.', usable: false };
  const userText = lastUserText(messages);
  const sys = [
    `You are the internal assistant for this hospital patient-management CRM application (advertiser_id=${adv}).`,
    'Your job is to help staff use and reason about ONLY this application and its data/functions.',
    'Absolute boundary: do NOT use web search, outside systems, outside medical knowledge, general RAG assumptions, or facts not contained in this app capability list, the user request, or tool results.',
    'If asked about anything outside this CRM, say in Korean that @시스템 cannot access or answer from outside systems/search and can only help with this CRM.',
    'If asked to confirm live data, use available tools when relevant. If no tool exists for that internal feature, explain what can be done in the CRM UI and say that this @시스템 chat cannot directly verify that data yet.',
    'For ANY question about doctor availability, customer appointment lookup, scheduling, appointments, consulting, operating, or procedure times, you MUST use the relevant scheduling tool before answering. Never invent doctors or times.',
    'If the staff asks to book/create/register an appointment, call create_appointment. If they ask to change/move/reschedule/modify an existing appointment, call reschedule_appointment; never update an existing appointment in place.',
    "Appointment type inference is mandatory: if the user says 수술/시술/오퍼/operation/surgery/procedure, set tool status='operating'. If the user says 진료/상담/consulting/consultation, set tool status='consulting'.",
    'If the staff asks for a customer’s existing appointment schedule, call find_customer_appointments.',
    'AI appointment changes must cancel the old appointment and create a new appointment record. Mention both the cancelled appointment id and new appointment id when the tool succeeds.',
    'If they only ask who is available, call find_available_doctors.',
    'If the user gives a date and weekday that disagree, prioritize the exact date, complete the requested internal action when possible, and mention the actual weekday in the answer.',
    'Never invent customers, campaign data, payments, policies, clinical advice, or records that were not supplied by the user or returned by tools.',
    `Supported CRM capability list:\n- ${CRM_FEATURES}`,
    `Answer in Korean, be concise and practical. Today is ${todayStr}.`,
  ].join(' ');
  const convo = [...messages];
  let inTok = 0, outTok = 0, cacheR = 0, cacheW = 0, reqId: string | null = null;

  for (let i = 0; i < 6; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: sys,
      tools: TOOLS,
      messages: convo,
    });
    inTok += resp.usage.input_tokens; outTok += resp.usage.output_tokens;
    cacheR += (resp.usage as any).cache_read_input_tokens || 0;
    cacheW += (resp.usage as any).cache_creation_input_tokens || 0;
    reqId = (resp as any)._request_id || resp.id;

    if (resp.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: resp.content });
      const results: any[] = [];
      for (const block of resp.content as any[]) {
        if (block.type === 'tool_use' && block.name === 'find_available_doctors') {
          let out: any;
          try {
            const inp = block.input || {};
            out = await findAvailableDoctors(adv, String(inp.date), String(inp.time), Number(inp.duration_min) || 30);
          } catch (e) { out = { error: (e as any)?.message }; }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        } else if (block.type === 'tool_use' && block.name === 'create_appointment') {
          let out: any;
          try {
            out = await createAppointment(adv, actor, { ...(block.input || {}), _user_text: userText });
          } catch (e) { out = { ok: false, error: (e as any)?.message }; }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        } else if (block.type === 'tool_use' && block.name === 'find_customer_appointments') {
          let out: any;
          try {
            out = await findCustomerAppointments(adv, block.input || {});
          } catch (e) { out = { ok: false, error: (e as any)?.message }; }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        } else if (block.type === 'tool_use' && block.name === 'reschedule_appointment') {
          let out: any;
          try {
            out = await rescheduleAppointment(adv, actor, { ...(block.input || {}), _user_text: userText });
          } catch (e) { out = { ok: false, error: (e as any)?.message }; }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
        }
      }
      convo.push({ role: 'user', content: results });
      continue;
    }
    // 최종 답변
    const textBlock: any = (resp.content as any[]).find((b) => b.type === 'text');
    await recordUsage({
      advertiserId: adv, actorType: actor.type, actorId: actor.id, conversationId: conversationKey,
      purpose: 'system_chat', inputTokens: inTok, outputTokens: outTok,
      cacheReadTokens: cacheR, cacheWriteTokens: cacheW, requestId: reqId,
    });
    return { answer: (textBlock?.text || '').trim() || '(응답 없음)', usable: true };
  }
  await recordUsage({
    advertiserId: adv, actorType: actor.type, actorId: actor.id, conversationId: conversationKey,
    purpose: 'system_chat', inputTokens: inTok, outputTokens: outTok,
    cacheReadTokens: cacheR, cacheWriteTokens: cacheW, requestId: reqId,
  });
  return { answer: '요청을 완료하지 못했습니다. 다시 시도해 주세요.', usable: true };
}
