import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';
import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';
import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleInParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleIn({ env, chat, telegramChatId, telegramThreadId }: HandleInParams): Promise<void> {
	const workDate = getCurrentDate(chat.timezone);

	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	if (!workDay) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos para hoy.');

		return;
	}

	const games = await getGamesByWorkDay(env.DB, workDay.id as number);

	const availableGames = games.filter((game) => game.work_session_id === null);

	if (availableGames.length === 0) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos pendientes de entrada.');

		return;
	}

	if (availableGames.length === 1) {
		const game = availableGames[0];

		await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_TIME', {
			gameId: game.id,
			workDayId: game.work_day_id,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})

Hora de entrada:`,
			{
				inline_keyboard: [
					[
						{
							text: '⏱ Ahora',
							callback_data: 'in:now',
						},
						{
							text: '✏️ Escribir',
							callback_data: 'in:manual',
						},
					],
				],
			},
		);

		return;
	}

	const keyboard = {
		inline_keyboard: availableGames.map((game) => [
			{
				text: `${game.game_emoji} ${game.game_name} |${game.scheduled_time}|`,
				callback_data: `in:game:${game.id}`,
			},
		]),
	};

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '¿Para qué juego?', keyboard);
}
