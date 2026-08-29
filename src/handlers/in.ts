import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';
import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';
import { sendTelegramMessage } from '../utils/telegram';
import { getDatePickerKeyboard } from '../utils/datePicker';

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
	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '¿Para qué día?', getDatePickerKeyboard('in'));
}

export async function startInForDate({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	workDate,
}: HandleInParams & {
	workDate: string;
}): Promise<void> {
	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	if (!workDay) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos para hoy.');

		return;
	}

	const games = await getGamesByWorkDay(env.DB, workDay.id as number);

	const pendingGames = games.filter((game) => game.work_session_id === null);

	if (pendingGames.length === 0) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos pendientes de entrada.');

		return;
	}

	if (pendingGames.length === 1) {
		const game = pendingGames[0];

		await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_TIME', {
			gameId: game.id,
			workDayId: workDay.id,
			workDate,
		});

		const today = getCurrentDate(chat.timezone);

		const keyboard =
			workDate === today
				? {
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
					}
				: {
						inline_keyboard: [
							[
								{
									text: '✏️ Escribir',
									callback_data: 'in:manual',
								},
							],
						],
					};

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})

Hora de entrada:`,
			keyboard,
		);

		return;
	}

	const keyboard = {
		inline_keyboard: pendingGames.map((game) => [
			{
				text: `${game.game_emoji} ${game.game_name} |${game.scheduled_time}|`,
				callback_data: `in:game:${game.id}:${workDate}`,
			},
		]),
	};

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'Elige un juego:', keyboard);
}
