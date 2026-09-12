import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getOpenWorkSession } from '../services/workSessionService';
import { getGamesByWorkDay } from '../services/gameService';

import { editTelegramMessage, sendTelegramMessage } from '../utils/telegram';

import { getDatePickerKeyboard } from '../utils/datePicker';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleOutParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

interface StartOutForDateParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	workDate: string;
	telegramMessageId?: number;
}

export async function handleOut({ env, chat, telegramChatId, telegramThreadId }: HandleOutParams): Promise<void> {
	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '¿Para qué día?', getDatePickerKeyboard('out'));
}

export async function startOutForDate({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	workDate,
	telegramMessageId,
}: StartOutForDateParams): Promise<void> {
	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	if (!workDay) {
		const text = 'No hay ninguna sesión abierta.';

		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text);
		}

		return;
	}

	const session = await getOpenWorkSession(env.DB, workDay.id as number);

	if (!session) {
		const text = 'No hay ninguna sesión abierta para este día.';

		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text);
		}

		return;
	}

	const games = await getGamesByWorkDay(env.DB, workDay.id as number);

	const orderedGames = [...games].sort((a, b) => {
		const timeCompare = a.scheduled_time.localeCompare(b.scheduled_time);

		if (timeCompare !== 0) {
			return timeCompare;
		}

		return Number(a.id) - Number(b.id);
	});

	const startIndex = orderedGames.findIndex((game) => Number(game.work_session_id) === Number(session.id));

	if (startIndex === -1) {
		const text = '❌ No se encontró el juego de entrada.';

		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text);
		}

		return;
	}

	const availableGames = [];

	for (let i = startIndex; i < orderedGames.length; i++) {
		const game = orderedGames[i];

		if (game.work_session_id !== null && Number(game.work_session_id) !== Number(session.id)) {
			break;
		}

		availableGames.push(game);
	}

	if (availableGames.length === 0) {
		const text = '❌ No hay juegos disponibles para cerrar esta sesión.';

		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text);
		}

		return;
	}

	const keyboard = {
		inline_keyboard: availableGames.map((game) => [
			{
				text: `${game.game_emoji} ${game.game_name} |${game.scheduled_time}|`,
				callback_data: `out:game:${game.id}:${workDate}`,
			},
		]),
	};

	const text = `Entrada: ${session.clock_in}

¿Hasta qué juego trabajaste?`;

	if (telegramMessageId) {
		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text, keyboard);
	} else {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text, keyboard);
	}
}
