import type { Chat } from '../services/chatService';

import { getCurrentDate } from '../utils/date';
import { sendTelegramMessage } from '../utils/telegram';

import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';
import { getDatePickerKeyboard } from '../utils/datePicker';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleEditParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleEdit({ env, chat, telegramChatId, telegramThreadId }: HandleEditParams): Promise<void> {
	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '¿Para qué día?', getDatePickerKeyboard('edit'));
}

export async function startEditForDate({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	workDate,
}: HandleEditParams & {
	workDate: string;
}): Promise<void> {
	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	if (!workDay) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos para editar este día.');

		return;
	}

	const games = await getGamesByWorkDay(env.DB, workDay.id as number);

	if (games.length === 0) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos para editar este día.');

		return;
	}

	const gameButtons = games.map((game) => ({
		text: `${game.game_emoji} ${game.game_name} ` + `|${game.scheduled_time}| ${game.client_name}`,
		callback_data: `edit:game:${game.id}`,
	}));

	const rows = [];

	for (let i = 0; i < gameButtons.length; i += 2) {
		rows.push(gameButtons.slice(i, i + 2));
	}

	const keyboard = {
		inline_keyboard: rows,
	};

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '¿Qué juego quieres editar?', {
		inline_keyboard: rows,
	});
}
