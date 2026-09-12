import type { Chat } from '../services/chatService';

import { getChatState, clearChatState, setChatState } from '../services/chatStateService';

import { getGameById, attachGameToSession, attachGamesToSessionRange } from '../services/gameService';

import { createWorkSession, closeWorkSession, getOpenWorkSessions, getOpenWorkSession } from '../services/workSessionService';

import { startInForDate } from '../handlers/in';

import { startOutForDate } from '../handlers/out';

import { getDateWithOffset, getCurrentDate } from '../utils/date';

import { editTelegramMessage, sendTelegramMessage } from '../utils/telegram';
import { getWorkDayByDate } from '../services/workDayService';
import { timeToMinutes } from '../utils/time';
import { saveTransientMessage } from '../utils/transientMessage';

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

export async function handleWorkCallbacks({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	callbackData,
}: Params): Promise<boolean> {
	const inDateMatch = callbackData.match(/^date:in:(today|tomorrow|yesterday|before_yesterday)$/);

	if (inDateMatch) {
		const choice = inDateMatch[1];

		let offset = 0;

		if (choice === 'tomorrow') {
			offset = 1;
		}

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
			telegramMessageId,
		});

		return true;
	}

	if (callbackData === 'date:in:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_DATE', {
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			`Escribe la fecha.

Formato: DD.MM.YYYY`,
		);

		return true;
	}

	const outDateMatch = callbackData.match(/^date:out:(today|tomorrow|yesterday|before_yesterday)$/);

	if (outDateMatch) {
		const choice = outDateMatch[1];

		let offset = 0;

		if (choice === 'tomorrow') {
			offset = 1;
		}

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
			telegramMessageId,
		});

		return true;
	}

	if (callbackData === 'date:out:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_OUT_DATE', {
			flowMessageId: telegramMessageId,
		});

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
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
			flowMessageId: telegramMessageId,
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

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
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

			await editTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramMessageId,
				`⚠️ Ya hay una sesión abierta desde ${openSession.clock_in}.

Primero registra la salida con /out.`,
			);

			return true;
		}

		const session = await createWorkSession(env.DB, data.workDayId, currentTime);

		await attachGameToSession(env.DB, data.gameId, session.id);

		await clearChatState(env.DB, chat.id);

		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, `✅ Entrada registrada: ${currentTime}`);

		await saveTransientMessage(env, chat.id, telegramMessageId);

		return true;
	}

	if (callbackData === 'in:manual') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_IN_TIME') {
			return true;
		}

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
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

		if (!data?.sessionId || !data?.workDayId || !data?.endGameId) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const currentTime = new Intl.DateTimeFormat('en-GB', {
			timeZone: chat.timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
		}).format(new Date());

		if (data.clockIn && timeToMinutes(currentTime) < timeToMinutes(data.clockIn)) {
			await editTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramMessageId,
				`❌ La hora de salida no puede ser anterior a la entrada.

Entrada: ${data.clockIn}`,
			);

			return true;
		}

		await attachGamesToSessionRange(env.DB, data.workDayId, data.sessionId, data.endGameId);

		await closeWorkSession(env.DB, data.sessionId, currentTime);

		await clearChatState(env.DB, chat.id);

		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, `✅ Salida registrada: ${currentTime}`);

		await saveTransientMessage(env, chat.id, telegramMessageId);

		return true;
	}

	if (callbackData === 'out:manual') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_OUT_TIME') {
			return true;
		}

		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			`Escribe la hora de salida.

Formato: HH:MM`,
		);

		return true;
	}

	const outGameMatch = callbackData.match(/^out:game:(\d+):(\d{4}-\d{2}-\d{2})$/);

	if (outGameMatch) {
		const gameId = Number(outGameMatch[1]);
		const workDate = outGameMatch[2];

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, '❌ Juego no encontrado.');

			return true;
		}

		const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

		if (!workDay) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, '❌ Día de trabajo no encontrado.');

			return true;
		}

		if (Number(game.work_day_id) !== Number(workDay.id)) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, '❌ El juego no pertenece a este día.');

			return true;
		}

		const session = await getOpenWorkSession(env.DB, workDay.id as number);

		if (!session) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, '❌ No hay ninguna sesión abierta.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_OUT_TIME', {
			sessionId: session.id,
			workDayId: workDay.id,
			workDate,
			clockIn: session.clock_in,
			endGameId: gameId,
			flowMessageId: telegramMessageId,
		});

		const today = getCurrentDate(chat.timezone);

		const text = `Entrada: ${session.clock_in}
Hasta: ${game.game_emoji} ${game.game_name} |${game.scheduled_time}|

¿Cómo quieres registrar la salida?`;

		const keyboard =
			workDate === today
				? {
						inline_keyboard: [
							[
								{
									text: '⏱ Ahora',
									callback_data: 'out:now',
								},
								{
									text: '✏️ Escribir',
									callback_data: 'out:manual',
								},
							],
						],
					}
				: {
						inline_keyboard: [
							[
								{
									text: '✏️ Escribir',
									callback_data: 'out:manual',
								},
							],
						],
					};

		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text, keyboard);

		return true;
	}

	return false;
}
