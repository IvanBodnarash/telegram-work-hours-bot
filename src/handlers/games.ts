import type { Chat } from '../services/chatService';
import { getGameTypes } from '../services/gameTypeService';
import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleGamesParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleGames({ env, chat, telegramChatId, telegramThreadId }: HandleGamesParams): Promise<void> {
	const gameTypes = await getGameTypes(env.DB, chat.id);

	if (gameTypes.length === 0) {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos configurados todavía.', {
			inline_keyboard: [
				[
					{
						text: '➕ Añadir juego',
						callback_data: 'games:add',
					},
				],
			],
		});

		return;
	}

	const list = gameTypes.map((gameType) => `${gameType.emoji} ${gameType.name}`).join('\n');

	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`🎮 Juegos

${list}`,
		{
			inline_keyboard: [
				[
					{
						text: '➕ Añadir juego',
						callback_data: 'games:add',
					},
				],
			],
		},
	);
}
