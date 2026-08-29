import type { Chat } from '../services/chatService';

import { clearChatState, setChatState } from '../services/chatStateService';

import { deleteGame, getGameById, updateGameType } from '../services/gameService';

import { getGameTypeById, getGameTypes } from '../services/gameTypeService';

import { deleteWorkSessionIfUnused } from '../services/workSessionService';

import { startEditForDate } from '../handlers/edit';

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

export async function handleEditCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
	const editGameMatch = callbackData.match(/^edit:game:(\d+)$/);

	if (editGameMatch) {
		const gameId = Number(editGameMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})

¿Qué quieres editar?`,
			{
				inline_keyboard: [
					[
						{
							text: '🕒 Hora',
							callback_data: `edit:time:${game.id}`,
						},
						{
							text: '👤 Cliente',
							callback_data: `edit:client:${game.id}`,
						},
						{
							text: '🎮 Juego',
							callback_data: `edit:type:${game.id}`,
						},
					],
					[
						{
							text: '⬇️ Entrada',
							callback_data: `edit:in:${game.id}`,
						},
						{
							text: '⬆️ Salida',
							callback_data: `edit:out:${game.id}`,
						},
						{
							text: '🗑 Eliminar',
							callback_data: `edit:delete:${game.id}`,
						},
					],
					[
						{
							text: '❌ Cancelar',
							callback_data: 'edit:cancel',
						},
					],
				],
			},
		);

		return true;
	}

	const editTimeMatch = callbackData.match(/^edit:time:(\d+)$/);

	if (editTimeMatch) {
		const gameId = Number(editTimeMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_EDIT_GAME_TIME', {
			gameId,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Hora actual: ${game.scheduled_time}

Escribe la nueva hora.

Formato: HH:MM`,
		);

		return true;
	}

	if (callbackData === 'edit:cancel') {
		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Edición cancelada.');

		return true;
	}

	const editClientMatch = callbackData.match(/^edit:client:(\d+)$/);

	if (editClientMatch) {
		const gameId = Number(editClientMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_EDIT_GAME_CLIENT', {
			gameId,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Cliente actual: ${game.client_name}

Escribe el nuevo nombre:`,
		);

		return true;
	}

	const editTypeMatch = callbackData.match(/^edit:type:(\d+)$/);

	if (editTypeMatch) {
		const gameId = Number(editTypeMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			return true;
		}

		const gameTypes = await getGameTypes(env.DB, chat.id);

		if (gameTypes.length === 0) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay juegos configurados.');

			return true;
		}

		const buttons = gameTypes.map((type) => ({
			text: `${type.emoji} ${type.name}`,
			callback_data: `edit:set_type:${gameId}:${type.id}`,
		}));

		const rows = [];

		for (let i = 0; i < buttons.length; i += 3) {
			rows.push(buttons.slice(i, i + 3));
		}

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Juego actual:

${game.game_emoji} ${game.game_name}

Selecciona el nuevo juego:`,
			{
				inline_keyboard: rows,
			},
		);

		return true;
	}

	const editDateMatch = callbackData.match(/^date:edit:(today|yesterday|before_yesterday)$/);

	if (editDateMatch) {
		const choice = editDateMatch[1];

		let offset = 0;

		if (choice === 'yesterday') {
			offset = -1;
		}

		if (choice === 'before_yesterday') {
			offset = -2;
		}

		const workDate = getDateWithOffset(chat.timezone, offset);

		await startEditForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (callbackData === 'date:edit:custom') {
		await setChatState(env.DB, chat.id, 'WAITING_FOR_EDIT_DATE');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Escribe la fecha.

Formato: DD.MM.YYYY`,
		);

		return true;
	}

	const editSetTypeMatch = callbackData.match(/^edit:set_type:(\d+):(\d+)$/);

	if (editSetTypeMatch) {
		const gameId = Number(editSetTypeMatch[1]);

		const gameTypeId = Number(editSetTypeMatch[2]);

		const gameType = await getGameTypeById(env.DB, gameTypeId, chat.id);

		if (!gameType) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		await updateGameType(env.DB, gameId, chat.id, gameTypeId);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`✅ Juego actualizado:

${gameType.emoji} ${gameType.name}`,
		);

		return true;
	}

	const editInMatch = callbackData.match(/^edit:in:(\d+)$/);

	if (editInMatch) {
		const gameId = Number(editInMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game || !game.work_session_id || !game.clock_in) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Este juego no tiene hora de entrada.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_EDIT_CLOCK_IN', {
			sessionId: game.work_session_id,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Entrada actual: ${game.clock_in}

Escribe la nueva hora.

Formato: HH:MM`,
		);

		return true;
	}

	const editOutMatch = callbackData.match(/^edit:out:(\d+)$/);

	if (editOutMatch) {
		const gameId = Number(editOutMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game || !game.work_session_id) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Este juego no tiene sesión de trabajo.');

			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_EDIT_CLOCK_OUT', {
			sessionId: game.work_session_id,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Salida actual: ${game.clock_out ?? '—'}

Escribe la nueva hora.

Formato: HH:MM`,
		);

		return true;
	}

	const editDeleteMatch = callbackData.match(/^edit:delete:(\d+)$/);

	if (editDeleteMatch) {
		const gameId = Number(editDeleteMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`⚠️ ¿Eliminar este juego?

${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})`,
			{
				inline_keyboard: [
					[
						{
							text: '🗑 Sí, eliminar',
							callback_data: `edit:confirm_delete:${game.id}`,
						},
					],
					[
						{
							text: '❌ Cancelar',
							callback_data: 'edit:cancel',
						},
					],
				],
			},
		);

		return true;
	}

	const editConfirmDeleteMatch = callbackData.match(/^edit:confirm_delete:(\d+)$/);

	if (editConfirmDeleteMatch) {
		const gameId = Number(editConfirmDeleteMatch[1]);

		const game = await getGameById(env.DB, gameId, chat.id);

		if (!game) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

			return true;
		}

		const sessionId = game.work_session_id;

		await deleteGame(env.DB, gameId, chat.id);

		if (sessionId) {
			await deleteWorkSessionIfUnused(env.DB, sessionId);
		}

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`✅ Juego eliminado:

${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})`,
		);

		return true;
	}

	return false;
}
