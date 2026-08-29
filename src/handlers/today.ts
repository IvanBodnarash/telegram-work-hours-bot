import type { Chat } from '../services/chatService';
import { formatDay } from '../formatters/dayFormatter';
import { sendTelegramMessage } from '../utils/telegram';
import { getCurrentDate } from '../utils/date';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleTodayParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleToday({ env, chat, telegramChatId, telegramThreadId }: HandleTodayParams): Promise<void> {
	const workDate = getCurrentDate(chat.timezone);

	const day = await formatDay({
		db: env.DB,
		chat,
		workDate,
	});

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, day.text);
}
