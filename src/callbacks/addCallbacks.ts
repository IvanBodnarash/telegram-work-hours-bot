import type { Chat } from '../services/chatService';

import { getChatState, clearChatState, setChatState } from '../services/chatStateService';

import { getGameTypeById } from '../services/gameTypeService';

import { createGame } from '../services/gameService';

import { getOrCreateWorkDay } from '../services/workDayService';

import { createWorkSession, closeWorkSession } from '../services/workSessionService';

import { attachGameToSession } from '../services/gameService';

import { startAddForDate } from '../handlers/add';

import { getDateWithOffset } from '../utils/date';

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

export async function handleAddCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
	if (callbackData === 'games:add') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_NAME');

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'Nombre del juego:');

		return true;
	}

	if (callbackData === 'add_game:save') {
		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_GAME_CONFIRMATION') {
			return true;
		}

		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId || !data?.scheduledTime || !data?.clientName || !data?.workDate) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const workDay = await getOrCreateWorkDay(env.DB, chat.id, data.workDate);

		const game = await createGame(env.DB, workDay.id, data.gameTypeId, data.scheduledTime, data.clientName);

		if (data.clockIn && data.clockOut) {
			const session = await createWorkSession(env.DB, workDay.id, data.clockIn);

			await closeWorkSession(env.DB, session.id, data.clockOut);

			await attachGameToSession(env.DB, game.id, session.id);
		}

		await clearChatState(env.DB, chat.id);

		const gameType = await getGameTypeById(env.DB, data.gameTypeId, chat.id);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`✅ Juego guardado

${gameType?.emoji ?? ''} ${gameType?.name ?? ''} |${data.scheduledTime}| (${data.clientName})`,
		);

		return true;
	}

	if (callbackData === 'add_game:cancel') {
		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Operación cancelada.');

		return true;
	}

	const addDateMatch = callbackData.match(/^date:add:(today|yesterday|before_yesterday)$/);

	if (addDateMatch) {
		const choice = addDateMatch[1];

		let offset = 0;

		if (choice === 'yesterday') {
			offset = -1;
		}

		if (choice === 'before_yesterday') {
			offset = -2;
		}

		const workDate = getDateWithOffset(chat.timezone, offset);

		await startAddForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (callbackData === 'date:add:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_ADD_DATE');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la fecha.

Formato: DD.MM.YYYY

Por ejemplo:
22.08.2026`,
		);

		return true;
	}

	const gameTypeMatch = callbackData.match(/^add_game:(\d+)$/);

	if (gameTypeMatch) {
		const gameTypeId = Number(gameTypeMatch[1]);

		const gameType = await getGameTypeById(env.DB, gameTypeId, chat.id);

		if (!gameType) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		const chatState = await getChatState(env.DB, chat.id);

		if (!chatState || chatState.state !== 'WAITING_FOR_GAME_TYPE') {
			return true;
		}

		const stateData = chatState.data ? JSON.parse(chatState.data) : null;

		if (!stateData?.workDate) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_TIME', {
			gameTypeId: gameType.id,
			workDate: stateData.workDate,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${gameType.emoji} ${gameType.name}

¿A qué hora es el juego?

Formato: HH:MM`,
		);

		return true;
	}

	return false;
}
