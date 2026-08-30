import type { Chat } from '../services/chatService';

import { getMonthSettings } from '../services/monthSettingsService';

import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';

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

export async function handleSettingsCallbacks({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	callbackData,
}: Params): Promise<boolean> {
	if (callbackData === 'settings:night_start') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_NIGHT_START', {
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
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
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			`Emoji actual: ${monthSettings?.emoji ?? '—'}

Envía el nuevo emoji para este mes:`,
		);

		return true;
	}

	return false;
}
