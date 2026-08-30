import type { Chat } from '../services/chatService';

import { setChatState } from '../services/chatStateService';

import { showMonthStats } from '../handlers/stats';

import { editTelegramMessage } from '../utils/telegram';

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

export async function handleStatsCallbacks({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	callbackData,
}: Params): Promise<boolean> {
	const monthMatch = callbackData.match(/^stats:month:(\d{4}):(\d{1,2})$/);

	if (monthMatch) {
		const year = Number(monthMatch[1]);
		const month = Number(monthMatch[2]);

		await showMonthStats({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			year,
			month,
			telegramMessageId,
		});

		return true;
	}

	if (callbackData === 'stats:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_STATS_MONTH', {
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			`Escribe el mes.

Formato: MM.YYYY`,
		);

		return true;
	}

	return false;
}
