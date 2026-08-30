import type { Chat } from '../services/chatService';

import { clearChatState } from '../services/chatStateService';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleCancelParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleCancel({ env, chat, telegramChatId, telegramThreadId }: HandleCancelParams): Promise<void> {
	await clearChatState(env.DB, chat.id);

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Operación cancelada.');
}
