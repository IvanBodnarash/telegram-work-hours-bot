import type { Chat } from '../services/chatService';

import { getMonthSettings } from '../services/monthSettingsService';
import { getGameTypes } from '../services/gameTypeService';
import { setChatState } from '../services/chatStateService';

import { editTelegramMessage, sendTelegramMessage } from '../utils/telegram';
import { getDatePickerKeyboard } from '../utils/datePicker';

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

interface StartAddForDateParams extends HandleAddParams {
	workDate: string;
	telegramMessageId?: number;
}

export async function handleAdd({ env, chat, telegramChatId, telegramThreadId }: HandleAddParams): Promise<void> {
	const flowMessageId = await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		'¿Para qué día?',
		getDatePickerKeyboard('add'),
	);

	await setChatState(env.DB, chat.id, 'WAITING_FOR_ADD_DATE_SELECTION', {
		flowMessageId,
	});
}

export async function startAddForDate({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	workDate,
	telegramMessageId,
}: StartAddForDateParams): Promise<void> {
	const [year, month] = workDate.split('-').map(Number);

	const monthSettings = await getMonthSettings(env.DB, chat.id, year, month);

	if (!monthSettings) {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_MONTH_EMOJI', {
			year,
			month,
			workDate,
			flowMessageId: telegramMessageId,
		});

		const monthDate = new Date(Date.UTC(year, month - 1, 1));

		const monthName = new Intl.DateTimeFormat('es-ES', {
			timeZone: 'UTC',
			month: 'long',
			year: 'numeric',
		}).format(monthDate);

		const text = `Nuevo mes: ${capitalize(monthName)}

Envía un emoji para este mes 🌴`;

		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text);
		}

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

	await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_TYPE', {
		workDate,
		flowMessageId: telegramMessageId,
	});

	if (telegramMessageId) {
		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, 'Elige un juego:', keyboard);
	} else {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'Elige un juego:', keyboard);
	}
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
