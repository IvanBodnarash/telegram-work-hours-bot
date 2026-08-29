import type { Chat } from '../services/chatService';

import { setChatState } from '../services/chatStateService';

import { showMonthStats } from '../handlers/stats';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface Params {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	callbackData: string;
}

export async function handleStatsCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
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
		});

		return true;
	}

	if (callbackData === 'stats:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_STATS_MONTH');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe el mes.

Formato: MM.YYYY

Por ejemplo:
07.2026`,
		);

		return true;
	}

	return false;
}
