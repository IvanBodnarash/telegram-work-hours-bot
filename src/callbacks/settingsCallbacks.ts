import type { Chat } from '../services/chatService';

import { getMonthSettings } from '../services/monthSettingsService';

import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';

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

export async function handleSettingsCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
	if (callbackData === 'settings:night_start') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_NIGHT_START');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Hora nocturna actual: ${chat.night_start}

Escribe la nueva hora.

Formato: HH:MM`,
		);

		return true;
	}

	if (callbackData === 'settings:month_emoji') {
		const currentDate = getCurrentDate(chat.timezone);

		const [year, month] = currentDate.split('-').map(Number);

		const monthSettings = await getMonthSettings(env.DB, chat.id, year, month);

		await setChatState(env.DB, chat.id, 'WAITING_FOR_SETTINGS_MONTH_EMOJI', {
			year,
			month,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Emoji actual: ${monthSettings?.emoji ?? '—'}

Envía el nuevo emoji para este mes:`,
		);

		return true;
	}

	return false;
}
