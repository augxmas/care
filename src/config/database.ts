import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

// Custom Encryption compatible with MariaDB fn_encrypt / fn_decrypt
const secret = 'monorama_adv_enc_key_2024_secret!';
const mysqlKeyString = crypto.createHash('sha256').update(secret).digest('hex'); // 64-character hex string

export function fn_encrypt(data: string | null | undefined): string | null | undefined {
  if (data === null || data === undefined || data === '') return data;
  try {
    const rawKey = Buffer.from(mysqlKeyString, 'utf8');
    const keyLen = 16; // aes-128-ecb
    const keyToUse = Buffer.alloc(keyLen, 0);
    for (let i = 0; i < rawKey.length; i++) {
      keyToUse[i % keyLen] ^= rawKey[i];
    }
    const cipher = crypto.createCipheriv('aes-128-ecb', keyToUse, null);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  } catch (err) {
    return data;
  }
}

export function fn_decrypt(data: string | null | undefined): string | null | undefined {
  if (data === null || data === undefined || data === '') return data;
  try {
    const rawKey = Buffer.from(mysqlKeyString, 'utf8');
    const keyLen = 16; // aes-128-ecb
    const keyToUse = Buffer.alloc(keyLen, 0);
    for (let i = 0; i < rawKey.length; i++) {
      keyToUse[i % keyLen] ^= rawKey[i];
    }
    const decipher = crypto.createDecipheriv('aes-128-ecb', keyToUse, null);
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return data;
  }
}

// Translate MySQL queries to SQLite queries
export function translateQueryForSqlite(sql: string, params: any[]): { sql: string, params: any[] } {
  let translatedSql = sql;
  const translatedParams = [...params];

  // 1. Handle fn_encrypt(?) in INSERT/UPDATE
  let searchIndex = 0;
  while (true) {
    const encIndex = translatedSql.indexOf('fn_encrypt(?)', searchIndex);
    if (encIndex === -1) break;
    
    const textBefore = translatedSql.substring(0, encIndex);
    const questionMarks = (textBefore.match(/\?/g) || []).length;
    
    if (questionMarks < translatedParams.length) {
      translatedParams[questionMarks] = fn_encrypt(translatedParams[questionMarks]);
    }
    
    translatedSql = translatedSql.substring(0, encIndex) + '?' + translatedSql.substring(encIndex + 'fn_encrypt(?)'.length);
    searchIndex = encIndex + 1;
  }

  // 2. Handle fn_decrypt(col) AS alias -> col AS __decrypted_alias
  translatedSql = translatedSql.replace(/fn_decrypt\((.*?)\)\s+AS\s+([a-zA-Z0-9_]+)/gi, '$1 AS __decrypted_$2');
  translatedSql = translatedSql.replace(/fn_decrypt\(([a-zA-Z0-9_\.]+)\)/gi, (match, col) => {
    const cleanCol = col.includes('.') ? col.split('.').pop() : col;
    return `${col} AS __decrypted_${cleanCol}`;
  });
  
  // 3. Handle INTERVAL expressions
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+MINUTE/gi, "datetime('now', 'localtime', '-$1 minutes')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+HOUR/gi, "datetime('now', 'localtime', '-$1 hours')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+DAY/gi, "datetime('now', 'localtime', '-$1 days')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+SECOND/gi, "datetime('now', 'localtime', '-$1 seconds')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+(\d+)\s+MINUTE/gi, "datetime('now', 'localtime', '+$1 minutes')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+(\d+)\s+HOUR/gi, "datetime('now', 'localtime', '+$1 hours')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+(\d+)\s+DAY/gi, "datetime('now', 'localtime', '+$1 days')");
  translatedSql = translatedSql.replace(/\bNOW\(\)\s*\+\s*INTERVAL\s+(\d+)\s+SECOND/gi, "datetime('now', 'localtime', '+$1 seconds')");

  // 3. Handle NOW(), current_timestamp(), CURDATE()
  translatedSql = translatedSql.replace(/\bNOW\(\)/gi, "datetime('now', 'localtime')");
  translatedSql = translatedSql.replace(/\bcurrent_timestamp\(\)/gi, "datetime('now', 'localtime')");
  translatedSql = translatedSql.replace(/\bCURDATE\(\)/gi, "date('now', 'localtime')");
  
  // 4. Handle ON DUPLICATE KEY UPDATE
  translatedSql = translatedSql.replace(
    /ON DUPLICATE KEY UPDATE\s+config_value\s*=\s*VALUES\(config_value\)/gi,
    "ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value"
  );

  return { sql: translatedSql, params: translatedParams };
}

// Decrypt row cells automatically
export function decryptRows(rows: any[]) {
  if (!rows || !Array.isArray(rows)) return rows;
  return rows.map(row => {
    const newRow = { ...row };
    for (const key in newRow) {
      if (key.startsWith('__decrypted_')) {
        const originalKey = key.replace('__decrypted_', '');
        newRow[originalKey] = fn_decrypt(newRow[key]);
        delete newRow[key];
      }
    }
    return newRow;
  });
}

// SQL DDL for SQLite initialization
const SQLITE_DDL = [
  // 1. system_config
  `CREATE TABLE IF NOT EXISTS system_config (
    config_key   TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description  TEXT,
    updated_at   TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 2. advertisers
  `CREATE TABLE IF NOT EXISTS advertisers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    company_name_en TEXT,
    business_no TEXT NOT NULL UNIQUE,
    ceo_name TEXT,
    address1 TEXT NOT NULL,
    address2 TEXT,
    postal_code TEXT NOT NULL,
    contact_name TEXT,
    contact_mobile TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    representative_phone TEXT,
    medical_subjects TEXT,
    fax TEXT,
    homepage TEXT,
    serial_no TEXT UNIQUE,
    email_hash TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    push_consent INTEGER DEFAULT 0,
    email_consent INTEGER DEFAULT 0,
    terms_consent INTEGER DEFAULT 0,
    privacy_consent INTEGER DEFAULT 0,
    biz_cert_path TEXT,
    biz_cert_name TEXT,
    status TEXT DEFAULT 'pending',
    status_reason TEXT,
    approved_at TEXT,
    bank_name TEXT,
    bank_account TEXT,
    email_verified INTEGER DEFAULT 0,
    last_login_ip TEXT,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    password_reset_required INTEGER DEFAULT 0
  )`,

  // 2-a. supervisor-configurable hospital registration form
  `CREATE TABLE IF NOT EXISTS hospital_form_fields (
    field_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    required INTEGER NOT NULL DEFAULT 0,
    searchable INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  `CREATE TABLE IF NOT EXISTS agency_form_fields (
    field_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    required INTEGER NOT NULL DEFAULT 0,
    searchable INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // Hospitals are managed independently from advertiser/agency accounts.
  `CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    company_name_en TEXT,
    hospital_id TEXT NOT NULL UNIQUE,
    ceo_name TEXT,
    business_no TEXT NOT NULL UNIQUE,
    biz_cert_path TEXT,
    biz_cert_name TEXT,
    representative_phone TEXT,
    address1 TEXT,
    address2 TEXT,
    postal_code TEXT,
    medical_subjects TEXT,
    fax TEXT,
    homepage TEXT,
    serial_no TEXT NOT NULL UNIQUE,
    contact_name TEXT,
    contact_mobile TEXT,
    contact_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    status_reason TEXT,
    approved_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  `CREATE TABLE IF NOT EXISTS hospital_agency_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id INTEGER NOT NULL,
    advertiser_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    token_hash TEXT NOT NULL UNIQUE,
    requested_by TEXT,
    requested_at TEXT DEFAULT (datetime('now', 'localtime')),
    responded_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(hospital_id, advertiser_id),
    FOREIGN KEY(hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    FOREIGN KEY(advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE
  )`,

  // 3. campaign_sequences
  `CREATE TABLE IF NOT EXISTS campaign_sequences (
    seq_date TEXT PRIMARY KEY,
    last_seq INTEGER DEFAULT 0
  )`,

  // 4. campaigns
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    advertiser_id INTEGER NOT NULL,
    campaign_name TEXT NOT NULL,
    description TEXT,
    discount_rate REAL DEFAULT 0,
    has_image INTEGER DEFAULT 0,
    has_html INTEGER DEFAULT 0,
    has_youtube INTEGER DEFAULT 0,
    image_url TEXT,
    image_path TEXT,
    image_filename TEXT,
    image_width INTEGER,
    image_height INTEGER,
    html_url TEXT,
    html_path TEXT,
    html_filename TEXT,
    youtube_url TEXT,
    image_sns TEXT NOT NULL DEFAULT '',
    html_sns TEXT NOT NULL DEFAULT '',
    youtube_sns TEXT NOT NULL DEFAULT '',
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    ad_days INTEGER DEFAULT 0,
    base_fee REAL DEFAULT 0,
    vat REAL DEFAULT 0,
    total_fee REAL DEFAULT 0,
    status TEXT DEFAULT '입금전',
    quotation_sent_at TEXT,
    quotation_token TEXT,
    quotation_read_at TEXT,
    payment_confirmed_at TEXT,
    payment_confirmed_by TEXT,
    files_backed_up INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    approved_at TEXT,
    approved_by TEXT,
    cancelled_at TEXT,
    cancelled_by TEXT,
    is_deleted INTEGER DEFAULT 0,
    collect_items TEXT,
    collect_item_options TEXT
  )`,

  // 5. email_verifications
  `CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    expires_at TEXT NOT NULL,
    purpose TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 6. login_histories
  `CREATE TABLE IF NOT EXISTS login_histories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    login_ip TEXT NOT NULL,
    login_at TEXT DEFAULT (datetime('now', 'localtime')),
    logout_at TEXT,
    session_id TEXT
  )`,

  // 7. email_logs
  `CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT,
    campaign_id TEXT,
    advertiser_id INTEGER,
    status TEXT DEFAULT 'sent',
    error_msg TEXT,
    sent_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 8. notices
  `CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    supported_languages TEXT NOT NULL DEFAULT 'ko,en',
    translations TEXT,
    is_pinned INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_by TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 9. doctors
  `CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    license_no TEXT,
    specialty TEXT,
    mobile TEXT,
    status TEXT DEFAULT 'active',
    password_hash TEXT,
    confirm_code_enc TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 10. managers
  `CREATE TABLE IF NOT EXISTS managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT,
    position TEXT,
    mobile TEXT,
    status TEXT DEFAULT 'active',
    password_hash TEXT,
    confirm_code_enc TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 11. recruiters
  `CREATE TABLE IF NOT EXISTS recruiters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    company_name TEXT NOT NULL,
    business_no TEXT NOT NULL,
    ceo_name TEXT,
    biz_type TEXT,
    biz_category TEXT,
    address1 TEXT,
    address2 TEXT,
    postal_code TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_mobile TEXT,
    contact_phone TEXT,
    recruiter_license_no TEXT,
    surety_bond_no TEXT,
    commission_rate REAL DEFAULT 0,
    biz_cert_name TEXT,
    biz_cert_path TEXT,
    recruiter_cert_name TEXT,
    recruiter_cert_path TEXT,
    surety_cert_name TEXT,
    surety_cert_path TEXT,
    status TEXT DEFAULT 'pending',
    status_reason TEXT,
    approved_at TEXT,
    approved_by TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 12. customer_visits
  `CREATE TABLE IF NOT EXISTS customer_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    name TEXT,
    pronunciation_ko TEXT,
    mobile TEXT,
    phone TEXT,
    birth_ymd TEXT,
    gender TEXT,
    nationality TEXT,
    address TEXT,
    postal_code TEXT,
    job TEXT,
    company TEXT,
    sns TEXT,
    email TEXT,
    user_id TEXT,
    hospital_patient_id TEXT,
    visitor_ip TEXT,
    user_agent TEXT,
    visit_type TEXT DEFAULT 'lead',
    visited_at TEXT DEFAULT (datetime('now', 'localtime')),
    treated_at TEXT,
    treatment_amount REAL,
    treatment_discount_rate REAL,
    payment_amount REAL,
    payment_method TEXT,
    doctor_id INTEGER,
    manager_id INTEGER,
    recruiter_id INTEGER,
    channel TEXT,
    customer_note TEXT
  )`,

  // 13. customers
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    visit_id INTEGER,
    hospital_patient_id TEXT,
    name TEXT,
    email TEXT NOT NULL,
    password_hash TEXT,
    mobile TEXT,
    status TEXT DEFAULT 'active',
    password_reset_required INTEGER DEFAULT 1,
    auto_created INTEGER DEFAULT 0,
    last_login_at TEXT,
    last_login_ip TEXT,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 14. holidays
  `CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER,
    holiday_date TEXT NOT NULL,
    name TEXT,
    day_type TEXT DEFAULT 'closed',
    is_system INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 15. appointments
  `CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    manager_id INTEGER,
    customer_id INTEGER,
    visit_id INTEGER,
    status TEXT NOT NULL,
    title TEXT,
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    note TEXT,
    notified_at TEXT,
    created_by TEXT,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 16. consult_posts
  `CREATE TABLE IF NOT EXISTS consult_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    author_email TEXT NOT NULL,
    hospital_patient_id TEXT,
    visit_id INTEGER,
    customer_id INTEGER,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    lang TEXT,
    password_hash TEXT NOT NULL,
    is_private INTEGER DEFAULT 1,
    status TEXT DEFAULT 'new',
    assigned_doctor_id INTEGER,
    handling_manager_id INTEGER,
    answered_at TEXT,
    conversation_id INTEGER,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 17. consult_answers
  `CREATE TABLE IF NOT EXISTS consult_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    author_type TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    chat_link_token TEXT,
    is_deleted INTEGER DEFAULT 0,
    deleted_at TEXT,
    deleted_by TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 18. chat_conversations
  `CREATE TABLE IF NOT EXISTS chat_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    post_id INTEGER,
    customer_email TEXT NOT NULL,
    customer_id INTEGER,
    hospital_patient_id TEXT,
    customer_lang TEXT,
    status TEXT DEFAULT 'open',
    last_message_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 19. chat_participants
  `CREATE TABLE IF NOT EXISTS chat_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    advertiser_id INTEGER NOT NULL,
    participant_type TEXT NOT NULL,
    participant_id INTEGER,
    display_name TEXT,
    lang TEXT,
    joined_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 20. chat_messages
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    sender_type TEXT NOT NULL,
    sender_id INTEGER,
    original_text TEXT,
    original_lang TEXT,
    translated_text TEXT,
    translated_lang TEXT,
    attachment_id INTEGER,
    is_training_log INTEGER DEFAULT 1,
    read_by_staff_at TEXT,
    read_by_customer_at TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 21. chat_attachments
  `CREATE TABLE IF NOT EXISTS chat_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    uploader_type TEXT NOT NULL,
    uploader_id INTEGER,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  `CREATE TABLE IF NOT EXISTS resource_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    description TEXT,
    tags TEXT,
    language TEXT NOT NULL DEFAULT 'en',
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 22. llm_usage
  `CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    api_type TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 23. chat_tokens
  `CREATE TABLE IF NOT EXISTS chat_tokens (
    token VARCHAR(64) PRIMARY KEY,
    advertiser_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    customer_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )`,

  // 24. consult_credentials
  `CREATE TABLE IF NOT EXISTS consult_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(advertiser_id, email)
  )`
];

const SQLITE_SEEDS = [
  // system_config seed
  `INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES
  ('company_name',     '(주)모노라마',          '회사명'),
  ('company_ceo',      '김창호',                '대표이사'),
  ('company_biz_no',   '277-86-00185',          '사업자등록번호'),
  ('company_bank',     '우리은행',              '은행명'),
  ('company_account',  '1005-802-852258',       '은행계좌번호'),
  ('tax_email',        'kimch@monorama.kr',     '세무담당자 이메일'),
  ('ad_price_per_day', '1000',                  '광고 유형별 1일 광고료(원)'),
  ('vat_rate',         '0.1',                   '부가세율'),
  ('supervisor_email', 'kimch@monorama.kr',     'Supervisor 이메일')`,

  // advertisers seed (Pre-approved advertiser id=1 & id=2)
  `INSERT OR IGNORE INTO advertisers (id, company_name, business_no, ceo_name, address1, address2, postal_code, contact_name, contact_mobile, contact_phone, contact_email, email_hash, password_hash, push_consent, email_consent, terms_consent, privacy_consent, biz_cert_path, biz_cert_name, status, status_reason, bank_account, email_verified, last_login_ip, last_login_at, created_at, updated_at, password_reset_required) VALUES 
  (1,'(주)모노라마','277-86-00185','f1ajBhFdYr81FdkQFbszAQ==','서울 강서구 마곡중앙로 143','','07797','f1ajBhFdYr81FdkQFbszAQ==','sBbJ2mARR3Oi0G0scGusXg==','AXunskk1EUutuGTS8NVDlg==','cCjV36AqRl//lIqbx1OA67RtnpOUgkgqc/7opgjP6UY=','7fe9695f838937d16c1d27bbd6a60b6bc6acc83ab182e0e8625ee01b4aa701db','$2b$12$zcQaLJYxCfmMrLZh/LoIw.V39lDcngV8l3KdEJjbRFkV3epHnONsO',1,1,1,1,'','','approved',NULL,NULL,1,'::1','2026-05-17 18:32:11','2026-05-17 14:19:25','2026-05-17 18:32:11',0),
  (2,'(주)모노라마 (테스트)','123-45-67890','TO/M6JI7zoeX4irtf1/Lfg==','서울시 강남구','','12345','Ba8PMir6BvamKoQEJA/eIA==','+lA3VmTkzvQnorm1VdTm8g==','','ivUYiGR2vyrzvtcf6JmKkqOJ7OWSdtRRCUrXyS4XriI=','02234413b1ed7311d041bc79025a561388a9fa20430b4a3b142f1a48aa675621','$2b$12$zcQaLJYxCfmMrLZh/LoIw.V39lDcngV8l3KdEJjbRFkV3epHnONsO',1,1,1,1,'','','approved',NULL,NULL,1,'::1','2026-05-17 18:32:11','2026-05-17 14:19:25','2026-05-17 18:32:11',0)`,

  // campaign_sequences seed
  `INSERT OR IGNORE INTO campaign_sequences (seq_date, last_seq) VALUES ('2026-05-17', 2)`
];

class SqlitePool {
  private db: any;
  private filename: string;

  constructor(filename: string) {
    this.filename = filename;
    this.initDatabase();
  }

  private initDatabase() {
    const sqlite3 = require('sqlite3').verbose();
    const dbDir = path.dirname(this.filename);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new sqlite3.Database(this.filename);
    this.initSchema();
  }

  private resetDatabase() {
    console.warn('[SQLite Corrupt Recovery] Re-creating corrupted SQLite database file:', this.filename);
    try {
      if (this.db) {
        this.db.close(() => {});
      }
    } catch (_) {}

    try {
      if (fs.existsSync(this.filename)) fs.unlinkSync(this.filename);
      if (fs.existsSync(this.filename + '-wal')) fs.unlinkSync(this.filename + '-wal');
      if (fs.existsSync(this.filename + '-shm')) fs.unlinkSync(this.filename + '-shm');
    } catch (e) {
      console.error('[SQLite Corrupt Recovery Error]', e);
    }

    this.initDatabase();
  }

  private initSchema() {
    this.db.serialize(() => {
      this.db.run('PRAGMA journal_mode = WAL;');
      this.db.run('PRAGMA busy_timeout = 10000;');
      this.db.run('PRAGMA foreign_keys = ON;');

      // 1. Run Table Definitions
      for (const ddl of SQLITE_DDL) {
        this.db.run(ddl, (err: any) => {
          if (err) {
            console.error('[SQLite Schema Init Error]', ddl, err);
          }
        });
      }
      // Additive migrations for databases created by earlier versions.
      const hospitalColumns = [
        'representative_phone TEXT',
        'medical_subjects TEXT',
        'fax TEXT',
        'homepage TEXT',
        'serial_no TEXT',
        'approved_at TEXT',
      ];
      for (const column of hospitalColumns) {
        this.db.run(`ALTER TABLE advertisers ADD COLUMN ${column}`, (err: any) => {
          if (err && !String(err.message).includes('duplicate column name')) {
            console.error('[SQLite Hospital Migration Error]', column, err);
          }
        });
      }
      const campaignSnsColumns = [
        "image_sns TEXT NOT NULL DEFAULT ''",
        "html_sns TEXT NOT NULL DEFAULT ''",
        "youtube_sns TEXT NOT NULL DEFAULT ''",
      ];
      for (const column of campaignSnsColumns) {
        this.db.run(`ALTER TABLE campaigns ADD COLUMN ${column}`, (err: any) => {
          if (err && !String(err.message).includes('duplicate column name')) {
            console.error('[SQLite Campaign SNS Migration Error]', column, err);
          }
        });
      }
      const noticeLanguageColumns = [
        "supported_languages TEXT NOT NULL DEFAULT 'ko,en'",
        'translations TEXT',
      ];
      for (const column of noticeLanguageColumns) {
        this.db.run(`ALTER TABLE notices ADD COLUMN ${column}`, (err: any) => {
          if (err && !String(err.message).includes('duplicate column name')) {
            console.error('[SQLite Notice Language Migration Error]', column, err);
          }
        });
      }
      this.db.run('ALTER TABLE hospitals ADD COLUMN hospital_id TEXT', (err: any) => {
        if (err && !String(err.message).includes('duplicate column name')) {
          console.error('[SQLite Hospital ID Migration Error]', err);
        }
      });
      this.db.run('ALTER TABLE hospitals ADD COLUMN company_name_en TEXT', () => {});
      this.db.run('ALTER TABLE advertisers ADD COLUMN company_name_en TEXT', () => {});
      this.db.run(`UPDATE hospitals SET hospital_id=CASE WHEN company_name='모즈의원' THEN 'mods' ELSE 'hospital-' || id END WHERE hospital_id IS NULL OR hospital_id=''`);
      this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitals_hospital_id ON hospitals(hospital_id)');
      this.db.run('ALTER TABLE hospital_form_fields ADD COLUMN searchable INTEGER NOT NULL DEFAULT 0', (err: any) => {
        if (err && !String(err.message).includes('duplicate column name')) {
          console.error('[SQLite Hospital Form Migration Error]', err);
        }
      });
      this.db.run('ALTER TABLE advertisers ADD COLUMN bank_name TEXT', (err: any) => {
        if (err && !String(err.message).includes('duplicate column name')) {
          console.error('[SQLite Agency Migration Error]', err);
        }
      });
      this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_advertisers_serial_no ON advertisers(serial_no)');
      this.db.run(
        `UPDATE advertisers SET approved_at=updated_at
          WHERE status='approved' AND approved_at IS NULL`,
      );
      const defaultHospitalFields: Array<[string, number, number, number]> = [
        ['company_name', 1, 1, 1], ['company_name_en', 1, 0, 2], ['hospital_id', 1, 1, 3], ['ceo_name', 1, 1, 4], ['business_no', 1, 1, 5],
        ['biz_cert', 1, 0, 5], ['representative_phone', 1, 1, 6], ['address1', 1, 1, 7],
        ['address2', 1, 0, 8], ['postal_code', 1, 1, 9], ['medical_subjects', 1, 0, 10],
        ['fax', 1, 0, 11], ['homepage', 1, 0, 12], ['contact_name', 1, 1, 13],
        ['contact_mobile', 1, 1, 14], ['contact_email', 1, 1, 15], ['serial_no', 1, 0, 16],
      ];
      for (const field of defaultHospitalFields) {
        this.db.run(
          'INSERT OR IGNORE INTO hospital_form_fields (field_key, enabled, required, sort_order) VALUES (?, ?, ?, ?)',
          field,
        );
      }
      const defaultAgencyFields: Array<[string, number, number, number, number]> = [
        ['company_name', 1, 1, 1, 1], ['company_name_en', 1, 0, 1, 2], ['ceo_name', 1, 1, 0, 3],
        ['business_no', 1, 1, 1, 3], ['biz_cert', 1, 0, 0, 4],
        ['contact_phone', 1, 1, 0, 5], ['address1', 1, 1, 0, 6],
        ['address2', 1, 0, 0, 7], ['postal_code', 1, 1, 0, 8],
        ['contact_name', 1, 1, 0, 9], ['contact_mobile', 1, 1, 0, 10],
        ['contact_email', 1, 1, 1, 11], ['bank_name', 1, 0, 1, 12],
        ['bank_account', 1, 0, 1, 13],
      ];
      for (const field of defaultAgencyFields) {
        this.db.run(
          'INSERT OR IGNORE INTO agency_form_fields (field_key, enabled, required, searchable, sort_order) VALUES (?, ?, ?, ?, ?)',
          field,
        );
      }
      // 2. Run Seed Queries
      for (const seed of SQLITE_SEEDS) {
        this.db.run(seed, (err: any) => {
          if (err) {
            console.error('[SQLite Seed Error]', seed, err);
          }
        });
      }
    });
    console.log('[AI Studio] SQLite Database schema & seeds initialized successfully.');
  }

  async execute<T = any>(sql: string, params: any[] = []): Promise<[T, any]> {
    return this.query<T>(sql, params);
  }

  async query<T = any>(sql: string, params: any[] = [], retryCount = 0): Promise<[T, any]> {
    const { sql: translatedSql, params: translatedParams } = translateQueryForSqlite(sql, params);
    
    return new Promise((resolve, reject) => {
      const isSelect = /^\s*(select|show|pragma)/i.test(translatedSql);
      
      const handleErr = (err: any) => {
        if (err && (err.code === 'SQLITE_CORRUPT' || String(err).includes('SQLITE_CORRUPT')) && retryCount < 1) {
          console.error('[SQLite CORRUPT Detected] Resetting database file and retrying query...', err);
          this.resetDatabase();
          return this.query<T>(sql, params, retryCount + 1).then(resolve).catch(reject);
        }
        return reject(err);
      };

      if (isSelect) {
        this.db.all(translatedSql, translatedParams, (err: any, rows: any[]) => {
          if (err) {
            console.error('[SQLite SELECT Error]', { sql: translatedSql, params: translatedParams, err });
            return handleErr(err);
          }
          const decrypted = decryptRows(rows);
          resolve([decrypted as unknown as T, null]);
        });
      } else {
        this.db.run(translatedSql, translatedParams, function(this: any, err: any) {
          if (err) {
            console.error('[SQLite RUN Error]', { sql: translatedSql, params: translatedParams, err });
            return handleErr(err);
          }
          const result = {
            insertId: this.lastID,
            affectedRows: this.changes,
            changedRows: this.changes
          };
          resolve([result as unknown as T, null]);
        });
      }
    });
  }

  async getConnection(): Promise<Connection> {
    return {
      query: this.query.bind(this),
      execute: this.execute.bind(this),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    };
  }

  async end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export interface Connection {
  execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface Pool {
  execute<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  query<T = any>(sql: string, params?: any[]): Promise<[T, any]>;
  getConnection(): Promise<Connection>;
  end(): Promise<void>;
}

// Check database connection logic and toggle SQLite fallback mode
let isSqlite = false;

export function getIsSqlite(): boolean {
  return isSqlite;
}

class MySqlPoolWrapper implements Pool {
  constructor(private rawPool: any) {}

  async execute<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
    return this.rawPool.execute(sql, params);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
    return this.rawPool.query(sql, params);
  }

  async getConnection(): Promise<Connection> {
    const rawConn = await this.rawPool.getConnection();
    return {
      execute: async (sql, params) => rawConn.execute(sql, params),
      query: async (sql, params) => rawConn.query(sql, params),
      beginTransaction: async () => rawConn.beginTransaction(),
      commit: async () => rawConn.commit(),
      rollback: async () => rawConn.rollback(),
      release: () => rawConn.release()
    };
  }

  async end(): Promise<void> {
    return this.rawPool.end();
  }
}

class DelegatingPool implements Pool {
  public activePool: Pool;

  constructor(initialPool: Pool) {
    this.activePool = initialPool;
  }

  async execute<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
    return this.activePool.execute<T>(sql, params);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<[T, any]> {
    return this.activePool.query<T>(sql, params);
  }

  async getConnection(): Promise<Connection> {
    return this.activePool.getConnection();
  }

  async end(): Promise<void> {
    return this.activePool.end();
  }
}

let initialPool: Pool;

if (process.env.DB_HOST && process.env.DB_PASSWORD) {
  try {
    const rawPool = mysql.createPool({
      host:               process.env.DB_HOST,
      port:               parseInt(process.env.DB_PORT || '3306'),
      database:           process.env.DB_NAME     || 'advertise',
      user:               process.env.DB_USER     || 'advertiser',
      password:           process.env.DB_PASSWORD,
      charset:            'utf8mb4',
      timezone:           '+09:00',
      waitForConnections: true,
      connectionLimit:    20,
      queueLimit:         0,
    });
    console.log('[AI Studio] Initializing MySQL connection pool...');
    initialPool = new MySqlPoolWrapper(rawPool);
  } catch (err) {
    console.warn('[AI Studio] Failed to init MySQL connection pool. Falling back to SQLite.', err);
    isSqlite = true;
    initialPool = new SqlitePool(path.join(process.cwd(), 'database', 'advertise.sqlite'));
  }
} else {
  console.log('[AI Studio] No MySQL credentials found in .env. Using fallback SQLite database.');
  isSqlite = true;
  initialPool = new SqlitePool(path.join(process.cwd(), 'database', 'advertise.sqlite'));
}

const pool = new DelegatingPool(initialPool);

export async function checkDatabaseConnection(): Promise<boolean> {
  if (isSqlite) return false;
  try {
    console.log('[AI Studio] Verifying MySQL connection pool...');
    // Try executing a query with a strict 2-second timeout
    const testPromise = pool.query('SELECT 1');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection check timed out')), 2000)
    );
    await Promise.race([testPromise, timeoutPromise]);
    console.log('[AI Studio] MySQL connection verification succeeded.');
    return true;
  } catch (err) {
    console.warn('[AI Studio] MySQL connection verification failed. Switching pool to SQLite fallback.', err);
    isSqlite = true;
    pool.activePool = new SqlitePool(path.join(process.cwd(), 'database', 'advertise.sqlite'));
    return false;
  }
}

export default pool;
