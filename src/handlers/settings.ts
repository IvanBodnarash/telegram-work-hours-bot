import type { Chat } from '../services/chatService';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleSettingsParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleSettings({ env, chat, telegramChatId, telegramThreadId }: HandleSettingsParams): Promise<void> {
	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`⚙️ Ajustes

Zona horaria: ${chat.timezone}
Inicio nocturno: ${chat.night_start}`,
		{
			inline_keyboard: [
				[
					{
						text: '🌙 Hora nocturna',
						callback_data: 'settings:night_start',
					},
				],
				[
					{
						text: '😀 Emoji del mes',
						callback_data: 'settings:month_emoji',
					},
				],
			],
		},
	);
}
