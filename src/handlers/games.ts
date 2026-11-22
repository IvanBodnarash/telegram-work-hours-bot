import type { Chat } from '../services/chatService';

import { getGameTypes } from '../services/gameTypeService';

import {
	editTelegramMessage,
	sendTelegramMessage,
} from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleGamesParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	telegramMessageId?: number;
}

export async function handleGames({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
}: HandleGamesParams): Promise<void> {
	const gameTypes = await getGameTypes(env.DB, chat.id);

	const gamesText =
		gameTypes.length > 0
			? gameTypes
				.map(
					(gameType) =>
						`${gameType.emoji} ${gameType.name}`,
				)
				.join('\n')
			: 'No hay juegos configurados.';

	const keyboard = {
		inline_keyboard: [
			[
				{
					text: '➕ Añadir juego',
					callback_data: 'games:add',
				},
			],
			...(gameTypes.length > 0
				? [
					[
						{
							text: '🗑 Eliminar juego',
							callback_data: 'games:delete',
						},
					],
				]
				: []),
		],
	};

	const text = `🎮 Juegos

${gamesText}`;

	if (telegramMessageId) {
		await editTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramMessageId,
			text,
			keyboard,
		);
	} else {
		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			text,
			keyboard,
		);
	}
}