import { Server as SocketServer, Socket } from 'socket.io';
import pool from '../config/database';
import { translate, systemChat } from '../services/llm.service';
import { appendChatTrainingLog } from '../services/chat-log.service';
import { countryToLang } from '../utils/lang';

// socket.data 타입
type SockCtx = {
  role: 'manager' | 'doctor' | 'advertiser' | 'customer';
  advertiserId: number;
  participantType: 'manager' | 'doctor' | 'customer';
  participantId: number | null;
  name: string;
  email?: string;
  conversationId?: number; // 고객 토큰에 묶인 대화
  lang: string;
};

async function authSocket(socket: Socket): Promise<SockCtx | null> {
  const token = socket.handshake.auth?.chatToken;
  if (token) {
    const [rows] = await pool.execute<any[]>(
      `SELECT ct.advertiser_id, ct.conversation_id, ct.customer_email, cc.customer_lang
         FROM chat_tokens ct INNER JOIN chat_conversations cc ON cc.id = ct.conversation_id
        WHERE ct.token=? AND ct.revoked=0 AND ct.expires_at > NOW()`, [String(token)]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      role: 'customer', advertiserId: r.advertiser_id, participantType: 'customer', participantId: null,
      name: r.customer_email, email: r.customer_email, conversationId: r.conversation_id, lang: r.customer_lang || 'en',
    };
  }
  const sess: any = (socket.request as any).session;
  const adv = sess?.advertiser; const user = sess?.user;
  if (!adv || !user) return null;
  const role = user.role || 'advertiser';
  if (!['manager', 'doctor', 'advertiser'].includes(role)) return null;
  return {
    role, advertiserId: adv.id, participantType: role === 'doctor' ? 'doctor' : 'manager',
    participantId: user.id, name: user.name || '담당자', lang: 'ko',
  };
}

// 스탭이 해당 대화에 접근 가능한지
async function canAccess(ctx: SockCtx, conversationId: number): Promise<any | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM chat_conversations WHERE id=? AND advertiser_id=?', [conversationId, ctx.advertiserId]);
  if (!rows.length) return null;
  const conv = rows[0];
  if (ctx.role === 'customer') return ctx.conversationId === conversationId ? conv : null;
  if (ctx.role === 'doctor') {
    const [p] = await pool.execute<any[]>(
      `SELECT 1 FROM chat_participants WHERE conversation_id=? AND participant_type='doctor' AND participant_id=?`,
      [conversationId, ctx.participantId]);
    return p.length ? conv : null;
  }
  return conv; // advertiser/manager
}

async function ensureCustomerLang(conv: any): Promise<string | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT cv.nationality
       FROM customer_visits cv INNER JOIN campaigns c ON c.id = cv.campaign_id
      WHERE c.advertiser_id = ? AND cv.email = ? AND cv.nationality IS NOT NULL AND cv.nationality <> ''
      ORDER BY cv.visited_at DESC LIMIT 1`,
    [conv.advertiser_id, conv.customer_email]);
  const lang = rows.length ? countryToLang(rows[0].nationality) : null;
  if (lang && conv.customer_lang !== lang) {
    await pool.execute('UPDATE chat_conversations SET customer_lang=? WHERE id=?', [lang, conv.id]);
    conv.customer_lang = lang;
  }
  return conv.customer_lang || lang || null;
}

function rowToMsg(m: any) {
  // 카카오톡식 읽음: 상대가 읽었으면 unread=0, 아니면 1 (고객발신→스탭읽음 / 스탭발신→고객읽음)
  const otherRead = m.sender_type === 'customer' ? !!m.read_by_staff_at : !!m.read_by_customer_at;
  return {
    id: m.id, conversation_id: m.conversation_id, sender_type: m.sender_type, sender_id: m.sender_id,
    original_text: m.original_text, original_lang: m.original_lang,
    translated_text: m.translated_text, translated_lang: m.translated_lang,
    attachment: m.attachment_id ? { id: m.attachment_id, name: m.original_name, path: m.file_path, mime: m.mime_type } : null,
    staff_only: m.staff_only ? 1 : 0,
    unread: otherRead ? 0 : 1,
    created_at: m.created_at,
  };
}

function nowStamp(): string { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// ── 읽음 표시: 채팅방 접속 프레즌스(메모리) ─────────────────
const presence = new Map<number, Map<string, Set<string>>>(); // cid -> (memberKey -> socketIds)
function memberKey(ctx: SockCtx): string {
  return ctx.role === 'customer' ? `c:${ctx.email || ctx.conversationId}` : `s:${ctx.participantType}:${ctx.participantId}`;
}
function senderKeyOf(m: { sender_type: string; sender_id: any }, customerEmail: string): string {
  return m.sender_type === 'customer' ? `c:${customerEmail}` : `s:${m.sender_type}:${m.sender_id}`;
}
function addPresence(cid: number, key: string, socketId: string) {
  let mm = presence.get(cid); if (!mm) { mm = new Map(); presence.set(cid, mm); }
  let set = mm.get(key); if (!set) { set = new Set(); mm.set(key, set); }
  set.add(socketId);
}
function removeSocketPresence(socketId: string) {
  for (const [cid, mm] of presence) {
    for (const [key, set] of mm) { if (set.delete(socketId) && set.size === 0) mm.delete(key); }
    if (mm.size === 0) presence.delete(cid);
  }
}
function presentMembers(cid: number): string[] { const mm = presence.get(cid); return mm ? [...mm.keys()] : []; }

export function initChat(io: SocketServer) {
  io.on('connection', async (socket) => {
    const ctx = await authSocket(socket);
    if (!ctx) { socket.emit('chat:error', { message: '인증 실패' }); socket.disconnect(true); return; }
    socket.data = ctx;
    if (ctx.role !== 'customer') socket.join('adv:' + ctx.advertiserId); // 스탭 기관방
    if (ctx.role === 'customer' && ctx.conversationId) socket.join('conv:' + ctx.conversationId);

    socket.on('chat:join', async (payload: any) => {
      const cid = parseInt(payload?.conversationId);
      const conv = await canAccess(ctx, cid);
      if (!conv) { socket.emit('chat:error', { message: '대화 접근 권한이 없습니다.' }); return; }
      socket.join('conv:' + cid);
      addPresence(cid, memberKey(ctx), socket.id);  // 접속 인원 등록
      // 스탭 참가자 등록(없으면) + 스탭 전용 방 입장
      if (ctx.role !== 'customer') {
        socket.join('conv-staff:' + cid);
        await pool.execute(
          `INSERT IGNORE INTO chat_participants (conversation_id, advertiser_id, participant_type, participant_id, display_name, lang)
           VALUES (?,?,?,?,?, 'ko')`, [cid, ctx.advertiserId, ctx.participantType, ctx.participantId, ctx.name]);
      }
      // 고객은 staff_only 메시지(시스템 질문/미공유 답변) 제외
      const onlyShared = ctx.role === 'customer' ? 'AND m.staff_only=0' : '';
      const [rows] = await pool.execute<any[]>(
        `SELECT m.*, att.original_name, att.file_path, att.mime_type,
                (SELECT COUNT(*) FROM chat_message_reads r WHERE r.message_id=m.id) AS read_cnt
           FROM chat_messages m LEFT JOIN chat_attachments att ON att.id=m.attachment_id
          WHERE m.conversation_id=? ${onlyShared} ORDER BY m.id DESC LIMIT 100`, [cid]);
      socket.emit('chat:history', { conversationId: cid, messages: rows.reverse().map(rowToMsg) });
    });

    socket.on('chat:message', async (payload: any) => {
      const cid = parseInt(payload?.conversationId);
      const text = String(payload?.text || '').trim();
      if (!text) return;
      const conv = await canAccess(ctx, cid);
      if (!conv) { socket.emit('chat:error', { message: '대화 접근 권한이 없습니다.' }); return; }
      const customerLang = await ensureCustomerLang(conv);

      const senderType = ctx.participantType;
      // 수신자 언어: 고객발신→스탭(ko), 스탭발신→고객(conversation.customer_lang|en)
      const targetLang = ctx.role === 'customer' ? 'ko' : (customerLang || 'en');
      const tr = await translate(text, targetLang, {
        advertiserId: ctx.advertiserId, conversationId: cid,
        actorType: ctx.role === 'customer' ? 'manager' : (ctx.participantType as any),
        actorId: ctx.participantId, customerEmail: conv.customer_email,
      });
      const origLang = tr.detectedLang || (ctx.role === 'customer' ? null : 'ko');
      // 고객 언어 캐시
      if (ctx.role === 'customer' && origLang && !conv.customer_lang) {
        await pool.execute('UPDATE chat_conversations SET customer_lang=? WHERE id=?', [origLang, cid]);
      }
      const [r]: any = await pool.execute(
        `INSERT INTO chat_messages
          (advertiser_id, conversation_id, sender_type, sender_id, original_text, original_lang, translated_text, translated_lang)
         VALUES (?,?,?,?,?,?,?,?)`,
        [ctx.advertiserId, cid, senderType, ctx.participantId, text, origLang, tr.translatedText, tr.translatedText ? targetLang : null]);
      await pool.execute('UPDATE chat_conversations SET last_message_at=NOW() WHERE id=?', [cid]);
      const msg = rowToMsg({
        id: r.insertId, conversation_id: cid, sender_type: senderType, sender_id: ctx.participantId,
        original_text: text, original_lang: origLang, translated_text: tr.translatedText,
        translated_lang: tr.translatedText ? targetLang : null, attachment_id: null,
        read_by_staff_at: null, read_by_customer_at: null,  // 방금 발신 → 상대 미독(unread=1)
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      });
      await appendChatTrainingLog({
        event: 'message_created',
        advertiserId: ctx.advertiserId,
        conversationId: cid,
        messageId: r.insertId,
        senderType,
        senderId: ctx.participantId,
        originalText: text,
        originalLang: origLang,
        translatedText: tr.translatedText,
        translatedLang: tr.translatedText ? targetLang : null,
        customerEmail: conv.customer_email,
        customerLang: customerLang || null,
      });
      io.to('conv:' + cid).emit('chat:message', msg);
      io.to('adv:' + ctx.advertiserId).emit('chat:conversation-updated', { conversationId: cid });
    });

    // @시스템: 스탭 전용 LLM 질의 — 고객에게 보이지 않음(staff_only=1)
    socket.on('chat:system', async (payload: any) => {
      if (ctx.role === 'customer') return; // 스탭 전용
      const cid = parseInt(payload?.conversationId);
      const text = String(payload?.text || '').trim();
      if (!text) return;
      const conv = await canAccess(ctx, cid);
      if (!conv) { socket.emit('chat:error', { message: '대화 접근 권한이 없습니다.' }); return; }

      // 질문 저장(스탭 전용) → 스탭 방에만 표시
      const [q]: any = await pool.execute(
        `INSERT INTO chat_messages (advertiser_id, conversation_id, sender_type, sender_id, original_text, original_lang, staff_only)
         VALUES (?,?,?,?,?, 'ko', 1)`, [ctx.advertiserId, cid, ctx.participantType, ctx.participantId, text]);
      io.to('conv-staff:' + cid).emit('chat:system-msg', rowToMsg({
        id: q.insertId, conversation_id: cid, sender_type: ctx.participantType, sender_id: ctx.participantId,
        original_text: text, original_lang: 'ko', staff_only: 1, created_at: nowStamp(),
      }));
      await appendChatTrainingLog({
        event: 'message_created',
        advertiserId: ctx.advertiserId,
        conversationId: cid,
        messageId: q.insertId,
        senderType: ctx.participantType,
        senderId: ctx.participantId,
        originalText: text,
        originalLang: 'ko',
        customerEmail: conv.customer_email,
        customerLang: conv.customer_lang || null,
        staffOnly: true,
      });

      // 고객에게 처리 중 안내 표시(고객 언어로 번역)
      const customerLang = await ensureCustomerLang(conv);
      const waitingText = '조회중입니다. 잠시만 기다려주세요';
      const waitingTargetLang = customerLang || 'en';
      const waitingTr = await translate(waitingText, waitingTargetLang, {
        advertiserId: ctx.advertiserId, conversationId: cid,
        actorType: ctx.participantType as any, actorId: ctx.participantId, customerEmail: conv.customer_email,
      });
      const [waitRow]: any = await pool.execute(
        `INSERT INTO chat_messages
          (advertiser_id, conversation_id, sender_type, sender_id, original_text, original_lang, translated_text, translated_lang, staff_only)
         VALUES (?,?, 'system', NULL, ?, 'ko', ?, ?, 0)`,
        [ctx.advertiserId, cid, waitingText, waitingTr.translatedText, waitingTr.translatedText ? waitingTargetLang : null]);
      const waitMsg = rowToMsg({
        id: waitRow.insertId, conversation_id: cid, sender_type: 'system', sender_id: null,
        original_text: waitingText, original_lang: 'ko',
        translated_text: waitingTr.translatedText, translated_lang: waitingTr.translatedText ? waitingTargetLang : null,
        staff_only: 0, read_by_customer_at: null, created_at: nowStamp(),
      });
      io.to('conv:' + cid).emit('chat:message', waitMsg);
      await appendChatTrainingLog({
        event: 'message_created',
        advertiserId: ctx.advertiserId,
        conversationId: cid,
        messageId: waitRow.insertId,
        senderType: 'system',
        senderId: null,
        originalText: waitingText,
        originalLang: 'ko',
        translatedText: waitingTr.translatedText,
        translatedLang: waitingTr.translatedText ? waitingTargetLang : null,
        customerEmail: conv.customer_email,
        customerLang: customerLang || null,
      });

      // LLM 호출
      let answer: string;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const out = await systemChat(ctx.advertiserId, { type: ctx.role as any, id: ctx.participantId }, cid, [{ role: 'user', content: text }], today);
        answer = out.answer;
      } catch (e) {
        answer = '시스템 처리에 실패했습니다: ' + ((e as any)?.message || '');
      }
      const [aRow]: any = await pool.execute(
        `INSERT INTO chat_messages (advertiser_id, conversation_id, sender_type, sender_id, original_text, original_lang, staff_only)
         VALUES (?,?, 'system', NULL, ?, 'ko', 1)`, [ctx.advertiserId, cid, answer]);
      io.to('conv-staff:' + cid).emit('chat:system-msg', rowToMsg({
        id: aRow.insertId, conversation_id: cid, sender_type: 'system', sender_id: null,
        original_text: answer, original_lang: 'ko', staff_only: 1, created_at: nowStamp(),
      }));
      await appendChatTrainingLog({
        event: 'message_created',
        advertiserId: ctx.advertiserId,
        conversationId: cid,
        messageId: aRow.insertId,
        senderType: 'system',
        senderId: null,
        originalText: answer,
        originalLang: 'ko',
        customerEmail: conv.customer_email,
        customerLang: conv.customer_lang || null,
        staffOnly: true,
      });
    });

    // 시스템 답변을 고객에게 공유 → 고객 언어로 번역 후 일반 메시지로 브로드캐스트
    socket.on('chat:share-system', async (payload: any) => {
      if (ctx.role === 'customer') return;
      const cid = parseInt(payload?.conversationId);
      const mid = parseInt(payload?.messageId);
      const conv = await canAccess(ctx, cid);
      if (!conv) { socket.emit('chat:error', { message: '대화 접근 권한이 없습니다.' }); return; }
      const [mr] = await pool.execute<any[]>(
        `SELECT * FROM chat_messages WHERE id=? AND conversation_id=? AND advertiser_id=? AND sender_type='system' AND staff_only=1`,
        [mid, cid, ctx.advertiserId]);
      if (!mr.length) { socket.emit('chat:error', { message: '공유할 수 없는 메시지입니다.' }); return; }
      const row = mr[0];
      const customerLang = await ensureCustomerLang(conv);
      const targetLang = customerLang || 'en';
      const tr = await translate(row.original_text, targetLang, {
        advertiserId: ctx.advertiserId, conversationId: cid,
        actorType: ctx.participantType as any, actorId: ctx.participantId, customerEmail: conv.customer_email,
      });
      await pool.execute(
        'UPDATE chat_messages SET staff_only=0, translated_text=?, translated_lang=?, read_by_customer_at=NULL WHERE id=?',
        [tr.translatedText, tr.translatedText ? targetLang : null, mid]);
      await pool.execute('UPDATE chat_conversations SET last_message_at=NOW() WHERE id=?', [cid]);
      io.to('conv:' + cid).emit('chat:message', rowToMsg({
        id: mid, conversation_id: cid, sender_type: 'system', sender_id: null,
        original_text: row.original_text, original_lang: row.original_lang,
        translated_text: tr.translatedText, translated_lang: tr.translatedText ? targetLang : null,
        staff_only: 0, read_by_customer_at: null, created_at: nowStamp(),
      }));
      await appendChatTrainingLog({
        event: 'system_shared',
        advertiserId: ctx.advertiserId,
        conversationId: cid,
        messageId: mid,
        senderType: 'system',
        senderId: null,
        originalText: row.original_text,
        originalLang: row.original_lang,
        translatedText: tr.translatedText,
        translatedLang: tr.translatedText ? targetLang : null,
        customerEmail: conv.customer_email,
        customerLang: customerLang || null,
      });
      io.to('adv:' + ctx.advertiserId).emit('chat:conversation-updated', { conversationId: cid });
    });

    socket.on('chat:typing', async (payload: any) => {
      const cid = parseInt(payload?.conversationId);
      socket.to('conv:' + cid).emit('chat:typing', { conversationId: cid, who: ctx.participantType });
    });

    socket.on('chat:read', async (payload: any) => {
      const cid = parseInt(payload?.conversationId);
      const conv = await canAccess(ctx, cid);
      if (!conv) return;
      // 내가 읽음 → 상대 발신 메시지만 읽음 처리 (고객=스탭 메시지 읽음 / 스탭=고객 메시지 읽음)
      const col = ctx.role === 'customer' ? 'read_by_customer_at' : 'read_by_staff_at';
      const senderCond = ctx.role === 'customer' ? "sender_type<>'customer'" : "sender_type='customer'";
      await pool.execute(`UPDATE chat_messages SET ${col}=NOW() WHERE conversation_id=? AND ${col} IS NULL AND ${senderCond}`, [cid]);
      // 상대에게 "읽음" 알림 → 상대 화면의 unread 배지 제거
      io.to('conv:' + cid).emit('chat:read', { conversationId: cid, by: ctx.role });
    });

    socket.on('disconnect', () => { removeSocketPresence(socket.id); });
  });
}

// 업로드 라우트에서 첨부 메시지 브로드캐스트용
export function broadcastAttachment(io: SocketServer, advertiserId: number, conversationId: number, msg: any) {
  io.to('conv:' + conversationId).emit('chat:message', msg);
  io.to('adv:' + advertiserId).emit('chat:conversation-updated', { conversationId });
}
