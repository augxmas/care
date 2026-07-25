import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { requireAdvertiser } from '../middleware/auth';
import { uploadAdFiles } from '../middleware/upload';
import { sendEmail } from '../services/email.service';
import { calculateFee, adTypeLabel, backupCampaignFiles, buildQuotationVars } from '../services/campaign.service';
import { generateCampaignId } from '../utils/id-generator';

const router = Router();

const ALLOWED_COLLECT = ['channel','name','nickname','gender','birth_ym','birth_ymd','mobile','phone','email','address','job','company','postal_code','sns','user_id','nationality','referrer_name','referrer_email','payment_method','payment_amount','pronunciation_ko','hospital_patient_id'];
const ALLOWED_CHANNELS = ['facebook', 'x', 'line', 'instagram', 'tiktok'];
const ALLOWED_NATIONALITIES = ['KR', 'CN', 'JP', 'US', 'VN', 'th', '한국', '중국', '일본', '미국', '베트남', '태국', '북미', '중동', '기타'];
const COLLECT_LABELS: Record<string, string> = {
  user_id: 'ID',
  hospital_patient_id: '병원ID(환자일련번호)',
  nationality: '국적',
  channel: '채널',
  name: '이름',
  pronunciation_ko: '이름(한국어 발음)',
  nickname: '닉네임',
  gender: '성별',
  birth_ym: '생년월',
  birth_ymd: '생년월일',
  referrer_name: '추천인 이름',
  referrer_email: '추천인 이메일',
  mobile: '모바일폰',
  phone: '전화',
  email: '이메일',
  address: '주소',
  job: '직업',
  company: '소속',
  postal_code: '우편번호',
  sns: 'SNS',
  payment_method: '결제수단',
  payment_amount: '결제금액',
};

function normalizeDiscountRate(raw: any): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('할인율은 숫자만 입력하세요.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('할인율은 0~100 사이의 숫자여야 합니다.');
  return n;
}

function normalizeCollectItems(raw: any): string[] {
  return (Array.isArray(raw) ? raw : (raw ? [raw] : []))
    .flatMap((v: any) => String(v).split(','))
    .map((s: string) => s.trim())
    .filter((s: string, idx: number, arr: string[]) => ALLOWED_COLLECT.includes(s) && arr.indexOf(s) === idx);
}

function normalizeChannels(raw: any): string[] {
  return (Array.isArray(raw) ? raw : (raw ? [raw] : []))
    .flatMap((v: any) => String(v).split(','))
    .map((s: string) => s.trim().toLowerCase())
    .filter((s: string, idx: number, arr: string[]) => ALLOWED_CHANNELS.includes(s) && arr.indexOf(s) === idx);
}

function normalizeCollectOptions(body: any, selected: string[]): Record<string, any> {
  const options: Record<string, any> = {
    __successMessage: String(body.collect_success_message || '').slice(0, 500),
  };
  for (const key of selected) {
    const defaultValue = key === 'channel'
      ? normalizeChannels(body[`collect_default_${key}`]).join(',')
      : String(body[`collect_default_${key}`] || '').slice(0, 500);
    options[key] = {
      hidden: body[`collect_hidden_${key}`] === '1' || body[`collect_hidden_${key}`] === 'on',
      required: body[`collect_required_${key}`] === '1' || body[`collect_required_${key}`] === 'on',
      defaultValue,
      placeholder: String(body[`collect_placeholder_${key}`] || '').slice(0, 200),
    };
  }
  return options;
}

function parseCollectOptions(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function hasChannelOption(options: Record<string, any>): boolean {
  return normalizeChannels(options.channel?.defaultValue).length > 0;
}

function digitsOnly(v: any): string {
  return String(v || '').replace(/\D/g, '');
}

function normalizeCollectValue(key: string, raw: any, opt: any = {}): { ok: boolean; value: string; message?: string } {
  if (key === 'gender') {
    const v = String(raw || '').trim().toUpperCase();
    if (v === 'M' || v === 'F') return { ok: true, value: v };
    if (v === '남') return { ok: true, value: 'M' };
    if (v === '여') return { ok: true, value: 'F' };
    return { ok: !v, value: '', message: '성별은 남 또는 여 중 선택하세요.' };
  }
  if (key === 'nationality') {
    const v = String(raw || '').trim();
    return { ok: !v || ALLOWED_NATIONALITIES.includes(v), value: v, message: '국적을 선택 목록 중에서 선택하세요.' };
  }
  if (key === 'birth_ymd') {
    const v = digitsOnly(raw).slice(0, 8);
    return { ok: !v || /^\d{8}$/.test(v), value: v, message: '생년월일은 yyyymmdd 형식의 숫자 8자리로 입력하세요.' };
  }
  if (key === 'birth_ym') {
    const v = digitsOnly(raw).slice(0, 6);
    return { ok: !v || /^\d{6}$/.test(v), value: v, message: '생년월은 yyyymm 형식의 숫자 6자리로 입력하세요.' };
  }
  if (key === 'mobile') {
    const v = digitsOnly(raw).slice(0, 11);
    return { ok: !v || /^\d{11}$/.test(v), value: v, message: '모바일은 숫자 11자리로 입력하세요.' };
  }
  if (key === 'phone') {
    const v = digitsOnly(raw).slice(0, 11);
    return { ok: !v || /^02\d{8}$/.test(v) || /^\d{11}$/.test(v), value: v, message: '전화는 숫자 10~11자리로 입력하세요. 02로 시작하는 서울 번호는 10자리도 가능합니다.' };
  }
  if (key === 'postal_code') {
    const v = digitsOnly(raw).slice(0, 10);
    return { ok: true, value: v };
  }
  if (key === 'email' || key === 'referrer_email') {
    const v = String(raw || '').trim();
    return { ok: !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), value: v, message: `${COLLECT_LABELS[key] || key} 양식을 확인하세요.` };
  }
  if (key === 'channel') {
    const allowedChannels = normalizeChannels(opt.defaultValue);
    const submitted = normalizeChannels(raw);
    const value = submitted.find((ch) => allowedChannels.includes(ch)) || '';
    return { ok: !String(raw || '').trim() || !!value, value, message: '채널을 선택 목록 중에서 선택하세요.' };
  }
  return { ok: true, value: String(raw || '') };
}

// 광고료 미리보기 (견적 계산)
router.post('/preview-fee', requireAdvertiser, (req: Request, res: Response) => {
  const { has_image, has_html, has_youtube, from_date, to_date } = req.body;
  if (!from_date || !to_date) return res.status(400).json({ error: '광고 기간을 입력하세요.' });
  if (new Date(to_date) < new Date(from_date)) {
    return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
  }
  const adTypes = {
    hasImage:   !!has_image,
    hasHtml:    !!has_html,
    hasYoutube: !!has_youtube,
  };
  if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
    return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
  }
  const fee = calculateFee(adTypes, from_date, to_date);
  res.json({ ok: true, ...fee });
});

// 캠페인 목록 조회
router.get('/', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign_name, ad_type, from_date, to_date, status, page = 1, size = 10 } = req.query;

  let where = 'WHERE c.advertiser_id = ?';
  const params: any[] = [adv.id];

  if (campaign_name) { where += ' AND c.campaign_name LIKE ?'; params.push(`%${campaign_name}%`); }
  if (ad_type === 'image')   { where += ' AND c.has_image = 1'; }
  if (ad_type === 'html')    { where += ' AND c.has_html = 1'; }
  if (ad_type === 'youtube') { where += ' AND c.has_youtube = 1'; }
  if (from_date) { where += ' AND c.from_date >= ?'; params.push(from_date); }
  if (to_date)   { where += ' AND c.to_date <= ?';   params.push(to_date); }
  if (status)    { where += ' AND c.status = ?';     params.push(status); }

  const pageNum  = Math.max(1, parseInt(String(page)));
  const pageSize = parseInt(String(size));
  const offset   = (pageNum - 1) * pageSize;

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total FROM campaigns c ${where}`, params
  );
  const total = countRows[0].total;

  const [rows] = await pool.execute<any[]>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM customer_visits cv WHERE cv.campaign_id = c.id) AS customer_count
       FROM campaigns c ${where}
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({ ok: true, data: rows, total, page: pageNum, size: pageSize });
});

// 캠페인 상세 (캠페인 ID 패턴: yymmdd_NNNN)
router.get('/:id(\\d{6}_\\d{4})', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  res.json({ ok: true, data: rows[0] });
});

// 캠페인 등록
router.post('/', requireAdvertiser,
  uploadAdFiles.fields([
    { name: 'image_file', maxCount: 1 },
    { name: 'html_file',  maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const {
      campaign_name, description, discount_rate,
      has_image, has_html, has_youtube,
      image_url, html_url, youtube_url,
      from_date, to_date,
      image_width, image_height,
      collect_items,
    } = req.body;
    let discountRate = 0;
    try {
      discountRate = normalizeDiscountRate(discount_rate);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    // collect_items: FormData 다중값일 수 있고 단일값일 수도 있음 -> CSV 정규화
    const collectList = normalizeCollectItems(collect_items);
    const collectCsv = collectList.join(',');
    const collectOptions = normalizeCollectOptions(req.body, collectList);
    if (collectList.includes('channel') && !hasChannelOption(collectOptions)) {
      return res.status(400).json({ error: '채널 수집항목은 Facebook, X, LINE, Instagram 중 1개 이상 선택하세요.' });
    }
    const collectItemOptions = JSON.stringify(collectOptions);

    const ALLOWED_SNS = ['instagram','x','tiktok','line'];
    const normSns = (raw: any) =>
      (Array.isArray(raw) ? raw : (raw ? [raw] : []))
        .flatMap((v: any) => String(v).split(','))
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => ALLOWED_SNS.includes(s))
        .join(',');
    const imageSnsCsv   = normSns(req.body.image_sns);
    const htmlSnsCsv    = normSns(req.body.html_sns);
    const youtubeSnsCsv = normSns(req.body.youtube_sns);

    if (!campaign_name || !from_date || !to_date) {
      return res.status(400).json({ error: '필수 항목을 입력하세요.' });
    }
    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
    }

    const adTypes = {
      hasImage:   !!has_image,
      hasHtml:    !!has_html,
      hasYoutube: !!has_youtube,
    };
    if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
      return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const imageFile   = files?.image_file?.[0];
    const htmlFile    = files?.html_file?.[0];

    // 광고물 검증
    if (adTypes.hasImage && !image_url && !imageFile) {
      return res.status(400).json({ error: '이미지 URL 또는 파일을 입력하세요.' });
    }
    if (adTypes.hasHtml && !html_url && !htmlFile) {
      return res.status(400).json({ error: 'HTML URL 또는 파일을 입력하세요.' });
    }
    if (adTypes.hasYoutube && !youtube_url) {
      return res.status(400).json({ error: 'YouTube URL을 입력하세요.' });
    }

    // 견적(fee) 기능 제거 — 광고일수만 보존, 금액은 0
    const adDays = Math.max(1, Math.round((new Date(to_date).getTime() - new Date(from_date).getTime()) / 86400000) + 1);
    const campaignId = await generateCampaignId();

    // 파일을 캠페인 ID 디렉토리로 이동
    let imagePath = null, imageFilename = null;
    let htmlPath  = null, htmlFilename  = null;
    let finalImageUrl = image_url || null;
    let finalHtmlUrl  = html_url  || null;

    const campaignDir = path.join(process.cwd(), 'uploads', 'active', String(adv.id), campaignId);
    fs.mkdirSync(campaignDir, { recursive: true });

    if (imageFile) {
      const dest = path.join(campaignDir, imageFile.filename);
      fs.renameSync(imageFile.path, dest);
      imagePath = dest;
      imageFilename = imageFile.originalname;
      finalImageUrl = `/uploads/active/${adv.id}/${campaignId}/${imageFile.filename}`;
    }
    if (htmlFile) {
      const dest = path.join(campaignDir, htmlFile.filename);
      fs.renameSync(htmlFile.path, dest);
      htmlPath = dest;
      htmlFilename = htmlFile.originalname;
      finalHtmlUrl = `/uploads/active/${adv.id}/${campaignId}/${htmlFile.filename}`;
    }

    const imgW = image_width  ? parseInt(String(image_width))  : null;
    const imgH = image_height ? parseInt(String(image_height)) : null;

    await pool.execute(
      `INSERT INTO campaigns
       (id, advertiser_id, campaign_name, description,
        discount_rate,
        has_image, has_html, has_youtube,
        image_url, image_path, image_filename, image_width, image_height,
        html_url, html_path, html_filename,
        youtube_url, from_date, to_date,
        ad_days, base_fee, vat, total_fee, quotation_token, collect_items, collect_item_options,
        image_sns, html_sns, youtube_sns, quotation_sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
      [
        campaignId, adv.id, campaign_name, description || '', discountRate,
        adTypes.hasImage ? 1 : 0, adTypes.hasHtml ? 1 : 0, adTypes.hasYoutube ? 1 : 0,
        finalImageUrl, imagePath, imageFilename, imgW, imgH,
        finalHtmlUrl, htmlPath, htmlFilename,
        youtube_url || null, from_date, to_date,
        adDays, 0, 0, 0, null, collectCsv, collectItemOptions,
        adTypes.hasImage ? imageSnsCsv : '', adTypes.hasHtml ? htmlSnsCsv : '', adTypes.hasYoutube ? youtubeSnsCsv : '',
      ]
    );

    res.json({ ok: true, campaignId, message: '캠페인이 등록되었습니다.' });
  }
);

// 캠페인 수정
router.put('/:id(\\d{6}_\\d{4})', requireAdvertiser,
  uploadAdFiles.fields([
    { name: 'image_file', maxCount: 1 },
    { name: 'html_file',  maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const adv = (req.session as any).advertiser;
    const [rows] = await pool.execute<any[]>(
      'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
      [req.params.id, adv.id]
    );
    if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
    const existing = rows[0];

    if (existing.status !== '입금전') {
      return res.status(400).json({ error: '입금전 상태의 캠페인만 수정 가능합니다.' });
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(existing.from_date) <= today) {
      return res.status(400).json({ error: '캠페인 시작일이 지난 캠페인은 수정할 수 없습니다.' });
    }

    const {
      campaign_name, description, discount_rate,
      has_image, has_html, has_youtube,
      image_url, html_url, youtube_url,
      from_date, to_date,
      image_width, image_height,
      collect_items,
    } = req.body;
    let discountRate = 0;
    try {
      discountRate = normalizeDiscountRate(discount_rate);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }

    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: '종료일은 시작일보다 이후여야 합니다.' });
    }

    const collectList = normalizeCollectItems(collect_items);
    const collectCsv = collectList.join(',');
    const collectOptions = normalizeCollectOptions(req.body, collectList);
    if (collectList.includes('channel') && !hasChannelOption(collectOptions)) {
      return res.status(400).json({ error: '채널 수집항목은 Facebook, X, LINE, Instagram 중 1개 이상 선택하세요.' });
    }
    const collectItemOptions = JSON.stringify(collectOptions);

    const ALLOWED_SNS_PUT = ['instagram','x','tiktok','line'];
    const normSnsPut = (raw: any) =>
      (Array.isArray(raw) ? raw : (raw ? [raw] : []))
        .flatMap((v: any) => String(v).split(','))
        .map((s: string) => s.trim().toLowerCase())
        .filter((s: string) => ALLOWED_SNS_PUT.includes(s))
        .join(',');
    const imageSnsCsv   = normSnsPut(req.body.image_sns);
    const htmlSnsCsv    = normSnsPut(req.body.html_sns);
    const youtubeSnsCsv = normSnsPut(req.body.youtube_sns);

    const adTypes = { hasImage: !!has_image, hasHtml: !!has_html, hasYoutube: !!has_youtube };
    if (!adTypes.hasImage && !adTypes.hasHtml && !adTypes.hasYoutube) {
      return res.status(400).json({ error: '광고물 유형을 하나 이상 선택하세요.' });
    }

    // 견적(fee) 기능 제거 — 광고일수만 보존
    const adDays = Math.max(1, Math.round((new Date(to_date).getTime() - new Date(from_date).getTime()) / 86400000) + 1);

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const imageFile = files?.image_file?.[0];
    const htmlFile  = files?.html_file?.[0];

    const campaignDir = path.join(process.cwd(), 'uploads', 'active', String(adv.id), existing.id);
    fs.mkdirSync(campaignDir, { recursive: true });

    let finalImageUrl = image_url || existing.image_url;
    let imagePath     = existing.image_path;
    let imageFilename = existing.image_filename;
    let imgW = image_width  ? parseInt(String(image_width))  : (existing.image_width  || null);
    let imgH = image_height ? parseInt(String(image_height)) : (existing.image_height || null);
    let finalHtmlUrl  = html_url  || existing.html_url;
    let htmlPath      = existing.html_path;
    let htmlFilename  = existing.html_filename;

    if (imageFile) {
      const dest = path.join(campaignDir, imageFile.filename);
      fs.renameSync(imageFile.path, dest);
      imagePath     = dest;
      imageFilename = imageFile.originalname;
      finalImageUrl = `/uploads/active/${adv.id}/${existing.id}/${imageFile.filename}`;
    }
    if (htmlFile) {
      const dest = path.join(campaignDir, htmlFile.filename);
      fs.renameSync(htmlFile.path, dest);
      htmlPath     = dest;
      htmlFilename = htmlFile.originalname;
      finalHtmlUrl = `/uploads/active/${adv.id}/${existing.id}/${htmlFile.filename}`;
    }

    await pool.execute(
      `UPDATE campaigns SET
       campaign_name=?, description=?, discount_rate=?,
       has_image=?, has_html=?, has_youtube=?,
       image_url=?, image_path=?, image_filename=?, image_width=?, image_height=?,
       html_url=?, html_path=?, html_filename=?,
       youtube_url=?, from_date=?, to_date=?,
       ad_days=?,
       collect_items=?, collect_item_options=?,
       image_sns=?, html_sns=?, youtube_sns=?
       WHERE id=?`,
      [
        campaign_name, description || '', discountRate,
        adTypes.hasImage ? 1 : 0, adTypes.hasHtml ? 1 : 0, adTypes.hasYoutube ? 1 : 0,
        finalImageUrl, imagePath, imageFilename, imgW, imgH,
        finalHtmlUrl, htmlPath, htmlFilename,
        youtube_url || null, from_date, to_date,
        adDays,
        collectCsv, collectItemOptions,
        adTypes.hasImage ? imageSnsCsv : '', adTypes.hasHtml ? htmlSnsCsv : '', adTypes.hasYoutube ? youtubeSnsCsv : '',
        existing.id,
      ]
    );

    res.json({ ok: true, message: '캠페인이 수정되었습니다.' });
  }
);

// 캠페인 취소
router.delete('/:id(\\d{6}_\\d{4})', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM campaigns WHERE id = ? AND advertiser_id = ?',
    [req.params.id, adv.id]
  );
  if (!rows.length) return res.status(404).json({ error: '캠페인을 찾을 수 없습니다.' });
  const campaign = rows[0];

  if (campaign.status === '광고중') {
    return res.status(400).json({ error: '진행중인 캠페인은 삭제, 취소할 수 없습니다.' });
  }
  if (campaign.status === '취소') {
    return res.status(400).json({ error: '이미 취소된 캠페인입니다.' });
  }
  if (campaign.status === '광고종료') {
    return res.status(400).json({ error: '종료된 캠페인은 취소할 수 없습니다.' });
  }

  await pool.execute('UPDATE campaigns SET status = ?, files_backed_up = 0 WHERE id = ?', ['취소', campaign.id]);

  backupCampaignFiles(campaign.id, adv.id);
  await pool.execute('UPDATE campaigns SET files_backed_up = 1 WHERE id = ?', [campaign.id]);

  const [advRows] = await pool.execute<any[]>(
    `SELECT company_name, fn_decrypt(contact_name) AS contact_name, fn_decrypt(contact_email) AS contact_email FROM advertisers WHERE id = ?`,
    [adv.id]
  );
  const advertiser = advRows[0];

  try {
    await sendEmail({
      templateKey: 'campaign_cancelled_advertiser',
      to: advertiser.contact_email,
      vars: { contact_name: advertiser.contact_name, campaign_id: campaign.id, campaign_name: campaign.campaign_name, supervisor_email: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr' },
      campaignId: campaign.id, advertiserId: adv.id,
    });
  } catch {}
  try {
    await sendEmail({
      templateKey: 'campaign_cancelled_supervisor',
      to: process.env.SUPERVISOR_EMAIL || 'kimch@monorama.kr',
      vars: { company_name: advertiser.company_name, campaign_id: campaign.id, campaign_name: campaign.campaign_name, cancelled_at: new Date().toLocaleString('ko-KR') },
      campaignId: campaign.id, advertiserId: adv.id,
    });
  } catch {}

  res.json({ ok: true });
});

// Excel 다운로드 (조회조건 전체)
router.get('/excel/download', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign_name, ad_type, from_date, to_date, status } = req.query;

  let where = 'WHERE c.advertiser_id = ?';
  const params: any[] = [adv.id];
  if (campaign_name) { where += ' AND c.campaign_name LIKE ?'; params.push(`%${campaign_name}%`); }
  if (ad_type === 'image')   { where += ' AND c.has_image = 1'; }
  if (ad_type === 'html')    { where += ' AND c.has_html = 1'; }
  if (ad_type === 'youtube') { where += ' AND c.has_youtube = 1'; }
  if (from_date) { where += ' AND c.from_date >= ?'; params.push(from_date); }
  if (to_date)   { where += ' AND c.to_date <= ?';   params.push(to_date); }
  if (status)    { where += ' AND c.status = ?';     params.push(status); }

  const [rows] = await pool.execute<any[]>(
    `SELECT c.* FROM campaigns c ${where} ORDER BY c.created_at DESC`, params
  );

  const wb  = new ExcelJS.Workbook();
  const ws  = wb.addWorksheet('캠페인 목록');
  ws.columns = [
    { header: '캠페인명',    key: 'campaign_name', width: 30 },
    { header: '이미지',      key: 'has_image',     width: 8  },
    { header: 'HTML',        key: 'has_html',      width: 8  },
    { header: 'YouTube',     key: 'has_youtube',   width: 10 },
    { header: '시작일',      key: 'from_date',     width: 12 },
    { header: '종료일',      key: 'to_date',       width: 12 },
    { header: '할인율(%)',   key: 'discount_rate', width: 12 },
    { header: '광고료(원)',  key: 'total_fee',     width: 14 },
    { header: '상태',        key: 'status',        width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      campaign_name: r.campaign_name,
      has_image:     r.has_image  ? 'O' : '',
      has_html:      r.has_html   ? 'O' : '',
      has_youtube:   r.has_youtube? 'O' : '',
      from_date:     r.from_date?.split('T')[0] || r.from_date,
      to_date:       r.to_date?.split('T')[0]   || r.to_date,
      discount_rate: r.discount_rate || 0,
      total_fee:     r.total_fee,
      status:        r.status,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="campaigns.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ── 캠페인 방문 추적 (public, no auth) ──────────────────────
// GET /api/campaigns/image-page/:campaign_id
router.get('/image-page/:campaign_id', async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, campaign_name, description, image_url, status
       FROM campaigns
      WHERE id = ? AND has_image = 1`,
    [req.params.campaign_id]
  );
  if (!rows.length || !rows[0].image_url) return res.status(404).json({ error: 'campaign_image_not_found' });
  const campaign = rows[0];
  res.json({
    ok: true,
    data: {
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      description: campaign.description || '',
      image_url: campaign.image_url,
      status: campaign.status,
      form_url: `/campaign-form/${campaign.id}`,
    },
  });
});

// GET /api/campaigns/form/:campaign_id
router.get('/form/:campaign_id', async (req: Request, res: Response) => {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, campaign_name, description, collect_items, collect_item_options, status
       FROM campaigns WHERE id = ?`,
    [req.params.campaign_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'campaign_not_found' });
  const campaign = rows[0];
  const items = normalizeCollectItems(campaign.collect_items);
  const options = parseCollectOptions(campaign.collect_item_options);
  res.json({
    ok: true,
    data: {
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      description: campaign.description || '',
      status: campaign.status,
      success_message: String(options.__successMessage || ''),
      fields: items.map((key) => ({
        key,
        label: COLLECT_LABELS[key] || key,
        hidden: !!options[key]?.hidden,
        required: !!options[key]?.required,
        defaultValue: String(options[key]?.defaultValue || ''),
        placeholder: String(options[key]?.placeholder || ''),
      })),
    },
  });
});

// POST /api/campaigns/form/:campaign_id
router.post('/form/:campaign_id', async (req: Request, res: Response) => {
  const campaignId = req.params.campaign_id;
  const [rows] = await pool.execute<any[]>(
    'SELECT id, collect_items, collect_item_options, status FROM campaigns WHERE id = ?',
    [campaignId]
  );
  if (!rows.length) return res.status(404).json({ error: 'campaign_not_found' });
  const campaign = rows[0];
  const allowed = normalizeCollectItems(campaign.collect_items);
  if (!allowed.length) return res.status(400).json({ error: '수집항목이 설정되지 않았습니다.' });

  const options = parseCollectOptions(campaign.collect_item_options);
  const cols: string[] = ['campaign_id'];
  const vals: any[] = [campaignId];

  for (const key of allowed) {
    const opt = options[key] || {};
    const raw = opt.hidden ? opt.defaultValue : (req.body[key] ?? opt.defaultValue ?? '');
    const normalized = normalizeCollectValue(key, raw, opt);
    const value = normalized.value;
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.message || `${COLLECT_LABELS[key] || key} 항목을 확인하세요.` });
    }
    if (opt.required && !value.trim()) {
      return res.status(400).json({ error: `${COLLECT_LABELS[key] || key} 항목을 입력하세요.` });
    }
    cols.push(key);
    vals.push(value.slice(0, 500));
  }

  cols.push('visitor_ip', 'user_agent');
  vals.push(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').slice(0, 45));
  vals.push(String(req.headers['user-agent'] || '').slice(0, 500));

  await pool.execute(
    `INSERT INTO customer_visits (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    vals
  );
  res.json({ ok: true, message: String(options.__successMessage || '') || '제출되었습니다.' });
});

// GET /api/campaigns/visit/:campaign_id?channel=...&name=...&...
router.get('/visit/:campaign_id', async (req: Request, res: Response) => {
  const campaignId = req.params.campaign_id;
  // 캠페인 존재 및 수집항목 확인
  const [rows] = await pool.execute<any[]>(
    'SELECT id, collect_items, collect_item_options, status FROM campaigns WHERE id = ?',
    [campaignId]
  );
  if (!rows.length) return res.status(404).json({ error: 'campaign_not_found' });
  const campaign = rows[0];
  const allowed = normalizeCollectItems(campaign.collect_items);
  if (!allowed.length) return res.status(204).end();

  const q = req.query || {};
  const cols: string[] = ['campaign_id'];
  const vals: any[] = [campaignId];
  for (const k of ALLOWED_COLLECT) {
    if (!allowed.includes(k)) continue;
    const v = (q as any)[k];
    if (v === undefined) continue;
    const options = parseCollectOptions(campaign.collect_item_options);
    const normalized = normalizeCollectValue(k, v, options[k] || {});
    if (!normalized.ok || !normalized.value) continue;
    cols.push(k);
    vals.push(normalized.value.slice(0, 500));
  }
  cols.push('visitor_ip', 'user_agent');
  vals.push(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').slice(0, 45));
  vals.push(String(req.headers['user-agent'] || '').slice(0, 500));

  await pool.execute(
    `INSERT INTO customer_visits (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    vals
  );
  res.json({ ok: true });
});

// ── 광고주의 고객 데이터 조회 ────────────────────────────────
// GET /api/campaigns/customers?campaign=&customer_name=&email=&sns=&channel=&from_date=&to_date=&page=1&size=10
router.get('/customers', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign, customer_name, email, sns, channel, from_date, to_date, page = 1, size = 10 } = req.query;

  let where = 'WHERE c.advertiser_id = ?';
  const params: any[] = [adv.id];
  if (campaign)      { where += ' AND (c.campaign_name LIKE ? OR c.id LIKE ?)'; params.push(`%${campaign}%`, `%${campaign}%`); }
  if (customer_name) { where += ' AND cv.name LIKE ?';   params.push(`%${customer_name}%`); }
  if (email)         { where += ' AND cv.email LIKE ?';  params.push(`%${email}%`); }
  if (sns)           { where += ' AND cv.sns LIKE ?';    params.push(`%${sns}%`); }
  if (channel)       { where += ' AND cv.channel LIKE ?';params.push(`%${channel}%`); }
  if (from_date)     { where += ' AND DATE(cv.visited_at) >= ?'; params.push(from_date); }
  if (to_date)       { where += ' AND DATE(cv.visited_at) <= ?'; params.push(to_date); }

  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total FROM customer_visits cv INNER JOIN campaigns c ON c.id = cv.campaign_id ${where}`,
    params
  );
  const total = countRows[0].total;

  const [data] = await pool.execute<any[]>(
    `SELECT cv.*, c.campaign_name, c.discount_rate AS campaign_discount_rate,
            d.name AS doctor_name, m.name AS manager_name,
            r.id AS recruiter_id, r.company_name AS recruiter_name
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       LEFT  JOIN doctors    d ON d.id = cv.doctor_id
       LEFT  JOIN managers   m ON m.id = cv.manager_id
       LEFT  JOIN recruiters r ON r.id = cv.recruiter_id
       ${where}
       ORDER BY cv.visited_at DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
});

// ── 고객정보 대시보드 통계 ──────────────────────────────────
// 고객=customer_visits 1행(유입). 병원ID 보유 = 환자(진료받음)로 간주.
router.get('/customer-stats', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const monthStart = "DATE_FORMAT(NOW(),'%Y-%m-01')";
  const inMonth = `(cv.visited_at >= ${monthStart} AND cv.visited_at < ${monthStart} + INTERVAL 1 MONTH)`;
  const isToday = `DATE(cv.visited_at) = CURDATE()`;
  const isPatient = `(cv.hospital_patient_id IS NOT NULL AND cv.hospital_patient_id <> '')`;
  const [rows] = await pool.execute<any[]>(
    `SELECT
       COUNT(*)                                       AS total_customers,
       COALESCE(SUM(${isPatient}), 0)                 AS total_patients,
       COALESCE(SUM(${inMonth}), 0)                   AS month_customers,
       COALESCE(SUM(${inMonth} AND ${isPatient}), 0)  AS month_patients,
       COALESCE(SUM(${isToday}), 0)                   AS today_customers,
       COALESCE(SUM(${isToday} AND ${isPatient}), 0)  AS today_patients,
       COUNT(DISTINCT NULLIF(cv.channel, ''))         AS channel_count,
       COUNT(DISTINCT cv.recruiter_id)                AS recruiter_count
     FROM customer_visits cv
     INNER JOIN campaigns c ON c.id = cv.campaign_id
     WHERE c.advertiser_id = ?`,
    [adv.id]
  );
  const r: any = rows[0] || {};
  const stats: any = {};
  Object.keys(r).forEach(k => { stats[k] = Number(r[k]) || 0; });
  res.json({ ok: true, stats });
});

function normalizeTreatmentDatetime(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return `${m[1]} ${m[2]}:00`;
}
function normalizeMoney(raw: any, label: string): number {
  const s = String(raw ?? '').replace(/,/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label}은 0보다 큰 숫자여야 합니다.`);
  return n;
}
function normalizeTreatmentDiscount(raw: any): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('할인율은 0~100 사이의 숫자여야 합니다.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('할인율은 0~100 사이의 숫자여야 합니다.');
  return n;
}
function calcPaymentAmount(amount: number, discountRate: number): number {
  return Math.max(0, Math.round(amount * (100 - discountRate) / 100));
}

// ── 단일 방문 수정 (병원ID / 노트 / 시술정보) ─────────────────
// PUT /api/campaigns/customer-visits/:id
// body: { hospital_patient_id?, customer_note?, visit_type?, treated_at?, treatment_amount?, treatment_discount_rate?, payment_method? }
router.put('/customer-visits/:id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const id  = parseInt(req.params.id);
  const sets: string[] = [];
  const vals: any[] = [];
  if (req.body.hospital_patient_id !== undefined) {
    const v = req.body.hospital_patient_id;
    sets.push('cv.hospital_patient_id = ?');
    vals.push((v == null || v === '') ? null : String(v).slice(0, 50));
  }
  if (req.body.customer_note !== undefined) {
    const v = req.body.customer_note;
    sets.push('cv.customer_note = ?');
    vals.push((v == null || v === '') ? null : String(v).slice(0, 500));
  }
  const treatmentKeys = ['visit_type', 'treated_at', 'treatment_amount', 'treatment_discount_rate', 'payment_amount', 'payment_method'];
  if (treatmentKeys.some(k => req.body[k] !== undefined)) {
    const visitType = String(req.body.visit_type || '').trim();
    if (visitType !== 'treated' && visitType !== 'consulted') {
      return res.status(400).json({ error: '시술여부 값이 잘못되었습니다.' });
    }
    if (visitType === 'treated') {
      const treatedAt = normalizeTreatmentDatetime(req.body.treated_at);
      const method = String(req.body.payment_method || '').trim();
      let treatmentAmount = 0;
      let discountRate = 0;
      try {
        treatmentAmount = normalizeMoney(req.body.treatment_amount ?? req.body.payment_amount, '금액');
        discountRate = normalizeTreatmentDiscount(req.body.treatment_discount_rate);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
      const paymentAmount = calcPaymentAmount(treatmentAmount, discountRate);
      if (!treatedAt) return res.status(400).json({ error: '시술일시를 YYYY-MM-DD HH:MM 형식으로 입력하세요.' });
      if (!method) return res.status(400).json({ error: '결제수단을 입력하세요.' });
      sets.push('cv.visit_type = ?', 'cv.treated_at = ?', 'cv.treatment_amount = ?', 'cv.treatment_discount_rate = ?', 'cv.payment_amount = ?', 'cv.payment_method = ?');
      vals.push('treated', treatedAt, treatmentAmount, discountRate, paymentAmount, method.slice(0, 100));
    } else {
      sets.push('cv.visit_type = ?', 'cv.treated_at = ?', 'cv.treatment_amount = ?', 'cv.treatment_discount_rate = ?', 'cv.payment_amount = ?', 'cv.payment_method = ?');
      vals.push('consulted', null, null, null, null, null);
    }
  }
  if (!sets.length) return res.status(400).json({ error: '변경할 항목이 없습니다.' });
  vals.push(id, adv.id);
  const [result]: any = await pool.execute(
    `UPDATE customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       SET ${sets.join(', ')}
       WHERE cv.id = ? AND c.advertiser_id = ?`,
    vals
  );
  if (!result.affectedRows) return res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
  res.json({ ok: true });
});

// ── 노트 일괄 수정: 동일 이름의 모든 방문 ─────────────────────
// PUT /api/campaigns/customers-by-name/note  body: { name, customer_note }
router.put('/customers-by-name/note', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name이 필요합니다.' });
  const v   = req.body.customer_note;
  const val = (v == null || v === '') ? null : String(v).slice(0, 500);
  const [result]: any = await pool.execute(
    `UPDATE customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       SET cv.customer_note = ?
       WHERE cv.name = ? AND c.advertiser_id = ?`,
    [val, name, adv.id]
  );
  res.json({ ok: true, affected: result.affectedRows });
});

// ── 환자(병원) ID 일괄 수정: 동일 이름의 모든 방문 ────────────
// PUT /api/campaigns/customers-by-name/patient-id  body: { name, hospital_patient_id }
router.put('/customers-by-name/patient-id', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name이 필요합니다.' });
  const v   = req.body.hospital_patient_id;
  const val = (v == null || v === '') ? null : String(v).slice(0, 50);
  const [result]: any = await pool.execute(
    `UPDATE customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       SET cv.hospital_patient_id = ?
       WHERE cv.name = ? AND c.advertiser_id = ?`,
    [val, name, adv.id]
  );
  res.json({ ok: true, affected: result.affectedRows });
});

// ── 광고주의 고객 데이터 (고객명 기준 집계) ─────────────────
// GET /api/campaigns/customers-by-name?campaign=&customer_name=&...&page=1&size=10
router.get('/customers-by-name', requireAdvertiser, async (req: Request, res: Response) => {
  const adv = (req.session as any).advertiser;
  const { campaign, customer_name, email, sns, channel, from_date, to_date, page = 1, size = 10 } = req.query;

  let where = `WHERE c.advertiser_id = ? AND cv.name IS NOT NULL AND cv.name != ''`;
  const params: any[] = [adv.id];
  if (campaign)      { where += ' AND (c.campaign_name LIKE ? OR c.id LIKE ?)'; params.push(`%${campaign}%`, `%${campaign}%`); }
  if (customer_name) { where += ' AND cv.name LIKE ?';   params.push(`%${customer_name}%`); }
  if (email)         { where += ' AND cv.email LIKE ?';  params.push(`%${email}%`); }
  if (sns)           { where += ' AND cv.sns LIKE ?';    params.push(`%${sns}%`); }
  if (channel)       { where += ' AND cv.channel LIKE ?';params.push(`%${channel}%`); }
  if (from_date)     { where += ' AND DATE(cv.visited_at) >= ?'; params.push(from_date); }
  if (to_date)       { where += ' AND DATE(cv.visited_at) <= ?'; params.push(to_date); }

  const pageNum = Math.max(1, parseInt(String(page)));
  const sizeNum = Math.min(1000, Math.max(1, parseInt(String(size))));
  const offset  = (pageNum - 1) * sizeNum;

  // 고객별 grid: (name, campaign_id) 단위 행 — 같은 고객이 여러 캠페인이면 여러 행
  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total FROM (
       SELECT cv.name, cv.campaign_id FROM customer_visits cv INNER JOIN campaigns c ON c.id = cv.campaign_id
       ${where} GROUP BY cv.name, cv.campaign_id
     ) sub`,
    params
  );
  const total = countRows[0].total;

  const [data] = await pool.execute<any[]>(
    `SELECT cv.name AS name,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.id ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS visit_id,
            c.id AS campaign_id, c.campaign_name AS campaign_name,
            MIN(cv.visited_at) AS visited_at,
            MAX(cv.treated_at) AS treated_at,
            SUM(CASE WHEN cv.visit_type='treated' THEN 1 ELSE 0 END) AS treated_count,
            SUM(CASE WHEN cv.visit_type='treated' THEN COALESCE(cv.treatment_amount, cv.payment_amount, 0) ELSE 0 END) AS treated_amount,
            SUM(CASE WHEN cv.visit_type='treated' THEN COALESCE(cv.payment_amount,0) ELSE 0 END) AS payment_amount_sum,
            MAX(cv.visit_type='treated') AS any_treated,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.email ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS email,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.user_id ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS user_id,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.hospital_patient_id ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS hospital_patient_id,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.customer_note ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS customer_note,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.nationality ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS nationality,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.pronunciation_ko ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS pronunciation_ko,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.birth_ymd ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS birth_ymd,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.birth_ym ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS birth_ym,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.referrer_name ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS referrer_name,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.referrer_email ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS referrer_email,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.payment_method ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS payment_method,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.payment_amount ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS payment_amount,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.treatment_amount ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS treatment_amount,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.treatment_discount_rate ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS treatment_discount_rate,
            MAX(c.discount_rate) AS campaign_discount_rate,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.mobile ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS mobile,
            SUBSTRING_INDEX(GROUP_CONCAT(cv.sns ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS sns,
            SUBSTRING_INDEX(GROUP_CONCAT(d.name ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS doctor_name,
            SUBSTRING_INDEX(GROUP_CONCAT(m.name ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS manager_name,
            SUBSTRING_INDEX(GROUP_CONCAT(r.company_name ORDER BY cv.visited_at DESC SEPARATOR '||'), '||', 1) AS recruiter_name
       FROM customer_visits cv
       INNER JOIN campaigns c ON c.id = cv.campaign_id
       LEFT  JOIN doctors    d ON d.id = cv.doctor_id
       LEFT  JOIN managers   m ON m.id = cv.manager_id
       LEFT  JOIN recruiters r ON r.id = cv.recruiter_id
       ${where}
       GROUP BY cv.name, cv.campaign_id
       ORDER BY cv.name ASC, MAX(cv.visited_at) DESC
       LIMIT ? OFFSET ?`,
    [...params, sizeNum, offset]
  );
  res.json({ ok: true, data, total });
});

// 견적서 읽음 추적
router.get('/track/:token', async (req: Request, res: Response) => {
  await pool.execute(
    'UPDATE campaigns SET quotation_read_at = NOW() WHERE quotation_token = ? AND quotation_read_at IS NULL',
    [req.params.token]
  );
  // 1x1 투명 GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.send(pixel);
});

export default router;
