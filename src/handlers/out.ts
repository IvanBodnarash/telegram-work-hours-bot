import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getOpenWorkSession } from '../services/workSessionService';
import { setChatState } from '../services/chatStateService';

import { getCurrentDate } from '../utils/date';
import { sendTelegramMessage } from '../utils/telegram';

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

export async function handleOut({ env, chat, telegramChatId, telegramThreadId }: HandleOutParams): Promise<void> {
	const workDate = getCurrentDate(chat.timezone);

	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	if (!workDay) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay ninguna sesión abierta.');

		return;
	}

	const session = await getOpenWorkSession(env.DB, workDay.id as number);

	if (!session) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay ninguna sesión abierta.');

		return;
	}

	await setChatState(env.DB, chat.id, 'WAITING_FOR_OUT_TIME', {
		sessionId: session.id,
	});

	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`Entrada: ${session.clock_in}

Hora de salida:`,
		{
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
		},
	);
}
