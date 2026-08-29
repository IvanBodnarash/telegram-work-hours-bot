import type { Chat } from '../services/chatService';
import { getChatState, clearChatState, setChatState } from '../services/chatStateService';
import { attachGameToSession, updateGameClientName, updateGameScheduledTime } from '../services/gameService';
import { createGameType, getGameTypeById } from '../services/gameTypeService';
import { createMonthSettings } from '../services/monthSettingsService';
import { closeWorkSession, createWorkSession } from '../services/workSessionService';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleStateParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	text: string;
}

function isSingleEmoji(value: string): boolean {
	const trimmed = value.trim();

	const segmenter = new Intl.Segmenter(undefined, {
		granularity: 'grapheme',
	});

	const segments = [...segmenter.segment(trimmed)];

	if (segments.length !== 1) {
		return false;
	}

	return /\p{Extended_Pictographic}/u.test(trimmed);
}

function isValidTime(value: string): boolean {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function handleState({ env, chat, telegramChatId, telegramThreadId, text }: HandleStateParams): Promise<boolean> {
	const chatState = await getChatState(env.DB, chat.id);

	if (!chatState) {
		return false;
	}

	if (chatState.state === 'WAITING_FOR_MONTH_EMOJI') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data) {
			await clearChatState(env.DB, chat.id);
			return false;
		}

		const emoji = text.trim();

		if (!isSingleEmoji(emoji)) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Envía solo un emoji.');

			return true;
		}

		await createMonthSettings(env.DB, chat.id, data.year, data.month, emoji);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`✅ Emoji guardado: ${emoji}

Ahora podemos añadir un juego.`,
		);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_NAME') {
		const gameName = text.trim();

		if (!gameName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Escribe un nombre válido.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_EMOJI', {
			gameName,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Juego: ${gameName}

Ahora envía un emoji para este juego.`,
		);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_EMOJI') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameName) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const emoji = text.trim();

		if (!isSingleEmoji(emoji)) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Envía solo un emoji.');

			return true;
		}

		await createGameType(env.DB, chat.id, data.gameName, emoji);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`✅ Juego añadido:

${emoji} ${data.gameName}`,
		);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_TIME') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const time = text.trim();

		if (!isValidTime(time)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
17:45`,
			);

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_CLIENT', {
			gameTypeId: data.gameTypeId,
			scheduledTime: time,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Hora: ${time}

¿Cuál es el nombre del cliente?`,
		);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_CLIENT') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId || !data?.scheduledTime) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const clientName = text.trim();

		if (!clientName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Escribe un nombre válido.');

			return true;
		}

		const gameType = await getGameTypeById(env.DB, data.gameTypeId, chat.id);

		if (!gameType) {
			await clearChatState(env.DB, chat.id);

			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_CONFIRMATION', {
			gameTypeId: data.gameTypeId,
			scheduledTime: data.scheduledTime,
			clientName,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${gameType.emoji} ${gameType.name} |${data.scheduledTime}| (${clientName})

¿Guardar?`,
			{
				inline_keyboard: [
					[
						{
							text: '✅ Guardar',
							callback_data: 'add_game:save',
						},
						{
							text: '❌ Cancelar',
							callback_data: 'add_game:cancel',
						},
					],
				],
			},
		);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_IN_TIME') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameId || !data?.workDayId) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const time = text.trim();

		if (!isValidTime(time)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
15:20`,
			);

			return true;
		}

		const session = await createWorkSession(env.DB, data.workDayId, time);

		await attachGameToSession(env.DB, data.gameId, session.id);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada registrada: ${time}`);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_OUT_TIME') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.sessionId) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const time = text.trim();

		if (!isValidTime(time)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
17:30`,
			);

			return true;
		}

		await closeWorkSession(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida registrada: ${time}`);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_GAME_TIME') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameId) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const time = text.trim();

		if (!isValidTime(time)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
17:30`,
			);

			return true;
		}

		await updateGameScheduledTime(env.DB, data.gameId, chat.id, time);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Hora actualizada: ${time}`);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_GAME_CLIENT') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameId) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const clientName = text.trim();

		if (!clientName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ El nombre no puede estar vacío.');

			return true;
		}

		await updateGameClientName(env.DB, data.gameId, chat.id, clientName);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Cliente actualizado: ${clientName}`);

		return true;
	}

	return false;
}
