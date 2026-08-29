import type { Chat } from '../services/chatService';

import { getChatState, clearChatState, setChatState } from '../services/chatStateService';

import { getGameById, attachGameToSession } from '../services/gameService';

import { createWorkSession, closeWorkSession, getOpenWorkSessions } from '../services/workSessionService';

import { startInForDate } from '../handlers/in';

import { startOutForDate } from '../handlers/out';

import { getDateWithOffset, getCurrentDate } from '../utils/date';

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

export async function handleWorkCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
	const inDateMatch = callbackData.match(/^date:in:(today|yesterday|before_yesterday)$/);

	if (inDateMatch) {
		const choice = inDateMatch[1];

		let offset = 0;

		if (choice === 'yesterday') {
			offset = -1;
		}

		if (choice === 'before_yesterday') {
			offset = -2;
		}

		const workDate = getDateWithOffset(chat.timezone, offset);

		await startInForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (callbackData === 'date:in:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_DATE');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la fecha.

Formato: DD.MM.YYYY`,
		);

		return true;
	}

	const outDateMatch = callbackData.match(/^date:out:(today|yesterday|before_yesterday)$/);

	if (outDateMatch) {
		const choice = outDateMatch[1];

		let offset = 0;

		if (choice === 'yesterday') {
			offset = -1;
		}

		if (choice === 'before_yesterday') {
			offset = -2;
		}

		const workDate = getDateWithOffset(chat.timezone, offset);

		await startOutForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (callbackData === 'date:out:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_OUT_DATE');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la fecha.

Formato: DD.MM.YYYY`,
		);

		return true;
	}

	const inGameMatch = callbackData.match(/^in:game:(\d+):(\d{4}-\d{2}-\d{2})$/);

	if (inGameMatch) {
		const gameId = Number(inGameMatch[1]);
		const workDate = inGameMatch[2];

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_TIME', {
			gameId: game.id,
			workDayId: game.work_day_id,
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

		return true;
	}

	if (callbackData === 'in:now') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_IN_TIME') {
			return true;
		}

		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameId || !data?.workDayId) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const currentTime = new Intl.DateTimeFormat('en-GB', {
			timeZone: chat.timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		}).format(new Date());

		const openSessions = await getOpenWorkSessions(env.DB, data.workDayId);

		if (openSessions.results.length > 0) {
			const openSession = openSessions.results[0] as {
				id: number;
				clock_in: string;
			};

			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`⚠️ Ya hay una sesión abierta desde ${openSession.clock_in}.

Primero registra la salida con /out.`,
			);

			return true;
		}

		const session = await createWorkSession(env.DB, data.workDayId, currentTime);

		await attachGameToSession(env.DB, data.gameId, session.id);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada registrada: ${currentTime}`);

		return true;
	}

	if (callbackData === 'in:manual') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_IN_TIME') {
			return true;
		}

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la hora de entrada.

Formato: HH:MM`,
		);

		return true;
	}

	if (callbackData === 'out:now') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_OUT_TIME') {
			return true;
		}

		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.sessionId) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const currentTime = new Intl.DateTimeFormat('en-GB', {
			timeZone: chat.timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		}).format(new Date());

		await closeWorkSession(env.DB, data.sessionId, currentTime);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida registrada: ${currentTime}`);

		return true;
	}

	if (callbackData === 'out:manual') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_OUT_TIME') {
			return true;
		}

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la hora de salida.

Formato: HH:MM`,
		);

		return true;
	}

	return false;
}
