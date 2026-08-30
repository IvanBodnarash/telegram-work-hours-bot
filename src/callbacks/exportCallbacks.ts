import type { Chat } from '../services/chatService';

import { setChatState } from '../services/chatStateService';

import { exportMonth } from '../handlers/export';

import { editTelegramMessage, sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface Params {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	telegramMessageId: number;
	callbackData: string;
}

export async function handleExportCallbacks({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	callbackData,
}: Params): Promise<boolean> {
	const monthMatch = callbackData.match(/^export:month:(\d{4}):(\d{1,2})$/);

	if (monthMatch) {
		const year = Number(monthMatch[1]);

		const month = Number(monthMatch[2]);

		await exportMonth({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			year,
			month,
		});

		return true;
	}

	if (callbackData === 'export:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_EXPORT_MONTH', {
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			`Escribe el mes.

Formato: MM.YYYY

Por ejemplo:
07.2026`,
		);

		return true;
	}

	return false;
}
