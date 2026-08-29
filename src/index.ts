import { getOrCreateChat } from './services/chatService';

import { handleToday } from './handlers/today';
import { handleWeek } from './handlers/week';
import { handleMonth } from './handlers/month';
import { handleAdd } from './handlers/add';
import { handleGames } from './handlers/games';
import { handleEdit } from './handlers/edit';
import { handleState } from './handlers/state';
import { handleIn } from './handlers/in';
import { handleOut } from './handlers/out';
import { handleSettings } from './handlers/settings';
import { handleHelp } from './handlers/help';

import { sendTelegramMessage, answerCallbackQuery } from './utils/telegram';

import { handleCallback } from './callbacks';

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

			await handleCallback({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
				callbackData: callback.data,
			});

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

		if (text === '/start') {
			await handleHelp({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

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

		if (text === '/week') {
			await handleWeek({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/month') {
			await handleMonth({
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

		if (text === '/in') {
			await handleIn({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/out') {
			await handleOut({
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

		if (text === '/edit') {
			await handleEdit({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/settings') {
			await handleSettings({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
			});

			return new Response('OK');
		}

		if (text === '/help') {
			await handleHelp({
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
