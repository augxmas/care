import fs from 'fs/promises';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const TRAINING_LOG = path.join(LOG_DIR, 'chat-training.jsonl');

type ChatTrainingLog = {
  event: 'message_created' | 'attachment_created' | 'system_shared';
  advertiserId: number;
  conversationId: number;
  messageId: number;
  senderType: string;
  senderId?: number | null;
  originalText?: string | null;
  originalLang?: string | null;
  translatedText?: string | null;
  translatedLang?: string | null;
  customerEmail?: string | null;
  customerLang?: string | null;
  attachment?: {
    id: number;
    name: string;
    path: string;
    mime?: string | null;
  } | null;
  staffOnly?: boolean;
};

export async function appendChatTrainingLog(row: ChatTrainingLog): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify({
      logged_at: new Date().toISOString(),
      ...row,
    });
    await fs.appendFile(TRAINING_LOG, line + '\n', 'utf8');
  } catch (e) {
    console.error('[chat-log] 학습 로그 기록 실패', (e as any)?.message || e);
  }
}
