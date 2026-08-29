import { getOrCreateChat } from './services/chatService';
import { getGameTypeById } from './services/gameTypeService';
import { handleToday } from './handlers/today';
import { handleAdd } from './handlers/add';
import { handleGames } from './handlers/games';
import { handleState } from './handlers/state';
import { sendTelegramMessage, answerCallbackQuery } from './utils/telegram';
import { setChatState } from './services/chatStateService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface TelegramChat {
	id: number;
	type: 'private' | 'group' | 'supergroup' | 'channel';
	title?: string;
	first_name?: string;
	username?: string;
}

interface TelegramMessage {
	chat: TelegramChat;
	text?: string;
	message_thread_id?: number;
}

interface TelegramCallbackQuery {
	id: string;
	data?: string;
	message?: TelegramMessage;
}

interface TelegramUpdate {
	message?: TelegramMessage;
	channel_post?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method !== 'POST') {
			return new Response('Work Hours Bot is running');
		}

		const update = await request.json<TelegramUpdate>();

		if (update.callback_query) {
			const callback = update.callback_query;

			await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, callback.id);

			const callbackMessage = callback.message;

			if (!callbackMessage || !callback.data) {
				return new Response('OK');
			}

			const telegramChatId = callbackMessage.chat.id;
			const telegramThreadId = callbackMessage.message_thread_id ?? null;

			const chatName = callbackMessage.chat.title ?? callbackMessage.chat.first_name ?? callbackMessage.chat.username ?? null;

			const chat = await getOrCreateChat(env.DB, {
				telegramChatId,
				telegramThreadId,
				chatType: callbackMessage.chat.type,
				chatName,
			});

			if (callback.data === 'games:add') {
				await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_NAME');

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'Nombre del juego:');
			}

			if (callback.data.startsWith('add_game:')) {
				const gameTypeId = Number(callback.data.split(':')[1]);

				if (!Number.isInteger(gameTypeId)) {
					return new Response('OK');
				}

				const gameType = await getGameTypeById(env.DB, gameTypeId, chat.id);

				if (!gameType) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

					return new Response('OK');
				}

				await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_TIME', {
					gameTypeId: gameType.id,
				});

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`${gameType.emoji} ${gameType.name}

¿A qué hora es el juego?

Formato: HH:MM`,
				);

				return new Response('OK');
			}

			return new Response('OK');
		}

		const message = update.channel_post ?? update.message;

		if (!message) {
			return new Response('OK');
		}

		const telegramChatId = message.chat.id;
		const telegramThreadId = message.message_thread_id ?? null;

		const chatName = message.chat.title ?? message.chat.first_name ?? message.chat.username ?? null;

		const chat = await getOrCreateChat(env.DB, {
			telegramChatId,
			telegramThreadId,
			chatType: message.chat.type,
			chatName,
		});

		console.log('Registered chat:', chat);

		const text = message.text;

		if (!text) {
			return new Response('OK');
		}

		if (text === '/test') {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '✅ Work Hours Bot works!');

			return new Response('OK');
		}

		if (text === '/today') {
			await handleToday({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/add') {
			await handleAdd({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/games') {
			await handleGames({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		const stateHandled = await handleState({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			text,
		});

		if (stateHandled) {
			return new Response('OK');
		}

		return new Response('OK');
	},
};

// async function sendTelegramMessage(botToken: string, chatId: number, threadId: number | null, text: string): Promise<void> {
// 	const body: {
// 		chat_id: number;
// 		text: string;
// 		message_thread_id?: number;
// 	} = {
// 		chat_id: chatId,
// 		text,
// 	};

// 	if (threadId !== null) {
// 		body.message_thread_id = threadId;
// 	}

// 	await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
// 		method: 'POST',
// 		headers: {
// 			'Content-Type': 'application/json',
// 		},
// 		body: JSON.stringify(body),
// 	});
// }
