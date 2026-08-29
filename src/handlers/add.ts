import type { Chat } from '../services/chatService';

import { getMonthSettings } from '../services/monthSettingsService';
import { getGameTypes } from '../services/gameTypeService';
import { setChatState } from '../services/chatStateService';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleAddParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleAdd({ env, chat, telegramChatId, telegramThreadId }: HandleAddParams): Promise<void> {
	const now = new Date();

	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: chat.timezone,
		year: 'numeric',
		month: '2-digit',
	}).formatToParts(now);

	const year = Number(parts.find((part) => part.type === 'year')?.value);

	const month = Number(parts.find((part) => part.type === 'month')?.value);

	const monthSettings = await getMonthSettings(env.DB, chat.id, year, month);

	if (!monthSettings) {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_MONTH_EMOJI', {
			year,
			month,
		});

		const monthName = new Intl.DateTimeFormat('es-ES', {
			timeZone: chat.timezone,
			month: 'long',
			year: 'numeric',
		}).format(now);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Nuevo mes: ${capitalize(monthName)}

Envía un emoji para este mes 🌴`,
		);

		return;
	}

	const gameTypes = await getGameTypes(env.DB, chat.id);

	if (gameTypes.length === 0) {
		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`No hay juegos configurados todavía.

Usa /games para añadir el primer juego.`,
		);

		return;
	}

	const keyboard = {
		inline_keyboard: gameTypes.map((gameType) => [
			{
				text: `${gameType.emoji} ${gameType.name}`,
				callback_data: `add_game:${gameType.id}`,
			},
		]),
	};

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'Elige un juego:', keyboard);
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
