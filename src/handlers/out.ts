import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getOpenWorkSession } from '../services/workSessionService';
import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';
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
		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, 'No hay ninguna sesión abierta.');
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay ninguna sesión abierta.');
		}

		return;
	}

	const session = await getOpenWorkSession(env.DB, workDay.id as number);

	if (!session) {
		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, 'No hay ninguna sesión abierta para este día.');
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay ninguna sesión abierta para este día.');
		}

		return;
	}

	await setChatState(env.DB, chat.id, 'WAITING_FOR_OUT_TIME', {
		sessionId: session.id,
		workDate,
		clockIn: session.clock_in,
		flowMessageId: telegramMessageId,
	});

	const today = getCurrentDate(chat.timezone);

	const text = `Entrada: ${session.clock_in}

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

	if (telegramMessageId) {
		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text, keyboard);
	} else {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text, keyboard);
	}
}
