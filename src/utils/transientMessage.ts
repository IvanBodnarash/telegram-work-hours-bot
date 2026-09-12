import type { Chat } from '../services/chatService';

import { clearLastTransientMessageId, setLastTransientMessageId } from '../services/chatService';

import { deleteTelegramMessage } from './telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

export async function saveTransientMessage(env: Env, chatId: number, messageId: number): Promise<void> {
	await setLastTransientMessageId(env.DB, chatId, messageId);
}

export async function clearPreviousTransientMessage(env: Env, chat: Chat, telegramChatId: number): Promise<void> {
	if (!chat.last_transient_message_id) {
		return;
	}

	await deleteTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, chat.last_transient_message_id);

	await clearLastTransientMessageId(env.DB, chat.id);
}
