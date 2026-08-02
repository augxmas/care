import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import pool from '../config/database';
dotenv.config();

const smtpHost = process.env.SMTP_HOST || 'smtp.worksmobile.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465');
const smtpUser = process.env.SMTP_USER || 'kimch@monorama.kr';
const smtpPass = process.env.SMTP_PASS || 'RPquTg9sqdEy';
const smtpFrom = process.env.SMTP_FROM || 'kimch@monorama.kr';
const smtpFromName = process.env.SMTP_FROM_NAME || '(주)모노라마';

const transporter = nodemailer.createTransport({
  host:   smtpHost,
  port:   smtpPort,
  secure: smtpPort === 465, // Use SSL/TLS for 465
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

const templatesPath = path.join(process.cwd(), 'email-templates.json');
let templates: Record<string, { subject: string; body: string }> = {};

function loadTemplates() {
  try {
    const raw = fs.readFileSync(templatesPath, 'utf-8');
    templates = JSON.parse(raw).templates;
  } catch {
    templates = {};
  }
}
loadTemplates();

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function sendEmail(params: {
  templateKey:    string;
  to:             string;
  vars:           Record<string, string>;
  campaignId?:    string;
  advertiserId?:  number;
  attachments?:   { filename: string; path: string }[];
}): Promise<void> {
  const tpl = templates[params.templateKey];
  if (!tpl) throw new Error(`이메일 템플릿을 찾을 수 없습니다: ${params.templateKey}`);

  const subject = replacePlaceholders(tpl.subject, params.vars);
  const html    = replacePlaceholders(tpl.body,    params.vars);

  let status: 'sent' | 'failed' = 'sent';
  let errorMsg = '';

  try {
    console.log(`[Email] Attempting to send email to ${params.to} using template ${params.templateKey}...`);
    await transporter.sendMail({
      from:        `"${smtpFromName}" <${smtpFrom}>`,
      to:          params.to,
      subject,
      html,
      attachments: params.attachments,
    });
    console.log(`[Email] Email sent successfully to ${params.to}`);
  } catch (e: any) {
    status   = 'failed';
    errorMsg = e.message;
    console.error('[Email Error]', e);
  }

  try {
    await pool.execute(
      `INSERT INTO email_logs (template_key, to_email, subject, campaign_id, advertiser_id, status, error_msg)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [params.templateKey, params.to, subject, params.campaignId || null, params.advertiserId || null, status, errorMsg || null]
    );
  } catch (dbErr) {
    console.error('[Email Log DB Error]', dbErr);
  }

  if (status === 'failed') throw new Error(errorMsg);
}

// 임의 본문 메일 발송 (템플릿 없이) + 발송 이력 기록
export async function sendRawEmail(params: {
  to: string;
  subject: string;
  html: string;
  advertiserId?: number;
  sentBy?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<void> {
  let status: 'sent' | 'failed' = 'sent';
  let errorMsg = '';
  try {
    console.log(`[Email] Attempting to send raw email to ${params.to}...`);
    await transporter.sendMail({
      from:        `"${smtpFromName}" <${smtpFrom}>`,
      to:          params.to,
      subject:     params.subject,
      html:        params.html,
      attachments: params.attachments,
    });
    console.log(`[Email] Raw email sent successfully to ${params.to}`);
  } catch (e: any) {
    status = 'failed';
    errorMsg = e.message;
    console.error('[Email Error]', e);
  }
  try {
    await pool.execute(
      `INSERT INTO email_logs (template_key, to_email, subject, advertiser_id, status, error_msg, body, sent_by)
       VALUES ('manual', ?, ?, ?, ?, ?, ?, ?)`,
      [params.to, params.subject, params.advertiserId || null, status, errorMsg || null, params.html, params.sentBy || null]
    );
  } catch (dbErr) {
    console.error('[Email Log DB Error]', dbErr);
  }
  if (status === 'failed') throw new Error(errorMsg);
}

export function getSystemVars(): Record<string, string> {
  return {
    company_name_mono: process.env.COMPANY_NAME       || '(주)모노라마',
    company_ceo:       process.env.COMPANY_CEO        || '김창호',
    company_biz_no:    process.env.COMPANY_BIZ_NO     || '277-86-00185',
    bank_name:         process.env.COMPANY_BANK_NAME  || '국민은행',
    bank_account:      process.env.COMPANY_BANK_ACCOUNT || '000-000-000000',
    tax_email:         process.env.TAX_MANAGER_EMAIL  || 'kimch@monorama.kr',
    supervisor_email:  process.env.SUPERVISOR_EMAIL   || 'kimch@monorama.kr',
    login_url:         `${process.env.BASE_URL || 'http://localhost:3000'}/`,
  };
}
