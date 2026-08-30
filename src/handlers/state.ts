import { updateNightStart, type Chat } from '../services/chatService';
import { getChatState, clearChatState, setChatState } from '../services/chatStateService';
import { attachGameToSession, updateGameClientName, updateGameScheduledTime } from '../services/gameService';
import { createGameType, getGameTypeById } from '../services/gameTypeService';
import { createMonthSettings, getMonthSettings, updateMonthEmoji } from '../services/monthSettingsService';
import {
	closeWorkSession,
	createWorkSession,
	getOpenWorkSessions,
	updateWorkSessionClockIn,
	updateWorkSessionClockOut,
} from '../services/workSessionService';
import { getCurrentDate, parseDisplayDate } from '../utils/date';
import { deleteTelegramMessage, editTelegramMessage, sendTelegramMessage } from '../utils/telegram';
import { timeToMinutes } from '../utils/time';
import { startAddForDate } from './add';
import { startEditForDate } from './edit';
import { exportMonth } from './export';
import { startInForDate } from './in';
import { startOutForDate } from './out';
import { showMonthStats } from './stats';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleStateParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	telegramMessageId: number;
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

async function deleteUserMessage(env: Env, telegramChatId: number, telegramMessageId: number): Promise<void> {
	await deleteTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId);
}

export async function handleState({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	text,
}: HandleStateParams): Promise<boolean> {
	const chatState = await getChatState(env.DB, chat.id);

	if (!chatState) {
		return false;
	}

	if (chatState.state === 'WAITING_FOR_MONTH_EMOJI') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.year || !data?.month) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const emoji = text.trim();

		if (!isSingleEmoji(emoji)) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Envía solo un emoji.');

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await createMonthSettings(env.DB, chat.id, data.year, data.month, emoji);

		const workDate = data.workDate;

		await clearChatState(env.DB, chat.id);

		if (workDate) {
			await startAddForDate({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
				workDate,
				telegramMessageId: data.flowMessageId,
			});
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_NAME') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const gameName = text.trim();

		if (!gameName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Escribe un nombre válido.');

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_EMOJI', {
			gameName,
			flowMessageId: data?.flowMessageId,
		});

		if (data?.flowMessageId) {
			await editTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				data.flowMessageId,
				`Juego: ${gameName}

Ahora envía un emoji para este juego.`,
			);
		} else {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`Juego: ${gameName}

Ahora envía un emoji para este juego.`,
			);
		}

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

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await createGameType(env.DB, chat.id, data.gameName, emoji);

		await clearChatState(env.DB, chat.id);

		const resultText = `✅ Juego añadido:

${emoji} ${data.gameName}`;

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, resultText);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, resultText);
		}

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

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_CLIENT', {
			gameTypeId: data.gameTypeId,
			scheduledTime: time,
			workDate: data.workDate,
			flowMessageId: data.flowMessageId,
		});

		if (data.flowMessageId) {
			await editTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				data.flowMessageId,
				`Hora: ${time}

Escribe el nombre del cliente:`,
			);
		} else {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`Hora: ${time}

Escribe el nombre del cliente:`,
			);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_GAME_CLIENT') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId || !data?.scheduledTime || !data?.workDate) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const clientName = text.trim();

		if (!clientName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ El nombre no puede estar vacío.');

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		const today = getCurrentDate(chat.timezone);

		if (data.workDate !== today) {
			await setChatState(env.DB, chat.id, 'WAITING_FOR_PAST_GAME_CLOCK_IN', {
				gameTypeId: data.gameTypeId,
				scheduledTime: data.scheduledTime,
				clientName,
				workDate: data.workDate,
				flowMessageId: data.flowMessageId,
			});

			const message = `Hora de entrada:

Formato: HH:MM`;

			if (data.flowMessageId) {
				await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, message);
			} else {
				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, message);
			}

			return true;
		}

		const gameType = await getGameTypeById(env.DB, data.gameTypeId, chat.id);

		if (!gameType) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_CONFIRMATION', {
			gameTypeId: data.gameTypeId,
			scheduledTime: data.scheduledTime,
			clientName,
			workDate: data.workDate,
			flowMessageId: data.flowMessageId,
		});

		const [year, month, day] = data.workDate.split('-');

		const confirmationText = `${gameType.emoji} ${gameType.name} |${data.scheduledTime}| (${clientName})

📅 ${day}.${month}.${year}

¿Guardar?`;

		const keyboard = {
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
		};

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, confirmationText, keyboard);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, confirmationText, keyboard);
		}

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

		const openSessions = await getOpenWorkSessions(env.DB, data.workDayId);

		if (openSessions.results.length > 0) {
			const openSession = openSessions.results[0] as {
				id: number;
				clock_in: string;
			};

			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`⚠️ Ya hay una sesión abierta desde ${openSession.clock_in}.

Primero registra la salida con /out.`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		const session = await createWorkSession(env.DB, data.workDayId, time);

		await attachGameToSession(env.DB, data.gameId, session.id);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Entrada registrada: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada registrada: ${time}`);
		}

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

		if (data.clockIn && timeToMinutes(time) < timeToMinutes(data.clockIn)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ La hora de salida no puede ser anterior a la entrada.

Entrada: ${data.clockIn}`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await closeWorkSession(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Salida registrada: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida registrada: ${time}`);
		}

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

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await updateGameScheduledTime(env.DB, data.gameId, chat.id, time);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Hora actualizada: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Hora actualizada: ${time}`);
		}

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

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await updateGameClientName(env.DB, data.gameId, chat.id, clientName);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Cliente actualizado: ${clientName}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Cliente actualizado: ${clientName}`);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_CLOCK_IN') {
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
12:30`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await updateWorkSessionClockIn(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Entrada actualizada: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada actualizada: ${time}`);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_CLOCK_OUT') {
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
18:45`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await updateWorkSessionClockOut(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Salida actualizada: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida actualizada: ${time}`);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_ADD_DATE') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const workDate = parseDisplayDate(text);

		if (!workDate) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Fecha no válida.

Usa el formato DD.MM.YYYY.

Por ejemplo:
22.08.2026`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await clearChatState(env.DB, chat.id);

		await startAddForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_PAST_GAME_CLOCK_IN') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId || !data?.scheduledTime || !data?.clientName || !data?.workDate) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const clockIn = text.trim();

		if (!isValidTime(clockIn)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
10:15`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await setChatState(env.DB, chat.id, 'WAITING_FOR_PAST_GAME_CLOCK_OUT', {
			...data,
			clockIn,
			flowMessageId: data.flowMessageId,
		});

		const message = `Hora de salida:

Formato: HH:MM`;

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, message);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, message);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_PAST_GAME_CLOCK_OUT') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.gameTypeId || !data?.scheduledTime || !data?.clientName || !data?.workDate || !data?.clockIn) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const clockOut = text.trim();

		if (!isValidTime(clockOut)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM, por ejemplo:
18:30`,
			);

			return true;
		}

		if (timeToMinutes(clockOut) < timeToMinutes(data.clockIn)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				'❌ La salida no puede ser anterior a la entrada.',
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await setChatState(env.DB, chat.id, 'WAITING_FOR_GAME_CONFIRMATION', {
			...data,
			clockOut,
		});

		const gameType = await getGameTypeById(env.DB, data.gameTypeId, chat.id);

		if (!gameType) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const [year, month, day] = data.workDate.split('-');

		const confirmationText = `${gameType.emoji} ${gameType.name} |${data.scheduledTime}| (${data.clientName})

📅 ${day}.${month}.${year}
⬇️ ${data.clockIn}
⬆️ ${clockOut}

¿Guardar?`;

		const keyboard = {
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
		};

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, confirmationText, keyboard);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, confirmationText, keyboard);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_IN_DATE') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const workDate = parseDisplayDate(text);

		if (!workDate) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Fecha no válida.

Usa el formato DD.MM.YYYY.`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await clearChatState(env.DB, chat.id);

		await startInForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_OUT_DATE') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const workDate = parseDisplayDate(text);

		if (!workDate) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Fecha no válida.

Usa el formato DD.MM.YYYY.`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await clearChatState(env.DB, chat.id);

		await startOutForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_DATE') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const workDate = parseDisplayDate(text);

		if (!workDate) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Fecha no válida.

Usa el formato DD.MM.YYYY.`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await clearChatState(env.DB, chat.id);

		await startEditForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_NIGHT_START') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const time = text.trim();

		if (!isValidTime(time)) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Hora no válida.

Usa el formato HH:MM.

Por ejemplo:
22:00`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		await updateNightStart(env.DB, chat.id, time);

		await clearChatState(env.DB, chat.id);

		if (data?.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Inicio nocturno actualizado: ${time}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Inicio nocturno actualizado: ${time}`);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_SETTINGS_MONTH_EMOJI') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		if (!data?.year || !data?.month) {
			await clearChatState(env.DB, chat.id);

			return true;
		}

		const emoji = text.trim();

		if (!isSingleEmoji(emoji)) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Envía solo un emoji.');

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		const existing = await getMonthSettings(env.DB, chat.id, data.year, data.month);

		if (existing) {
			await updateMonthEmoji(env.DB, chat.id, data.year, data.month, emoji);
		} else {
			await createMonthSettings(env.DB, chat.id, data.year, data.month, emoji);
		}

		await clearChatState(env.DB, chat.id);

		if (data.flowMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, data.flowMessageId, `✅ Emoji actualizado: ${emoji}`);
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Emoji actualizado: ${emoji}`);
		}

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EXPORT_MONTH') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const value = text.trim();

		const match = value.match(/^(0[1-9]|1[0-2])\.(\d{4})$/);

		if (!match) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Formato incorrecto.

Usa MM.YYYY.

Por ejemplo:
07.2026`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		const month = Number(match[1]);
		const year = Number(match[2]);

		await clearChatState(env.DB, chat.id);

		if (data?.flowMessageId) {
			await editTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				data.flowMessageId,
				`📄 Exportando ${String(month).padStart(2, '0')}.${year}...`,
			);
		}

		await exportMonth({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			year,
			month,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_STATS_MONTH') {
		const data = chatState.data ? JSON.parse(chatState.data) : null;

		const value = text.trim();

		const match = value.match(/^(0[1-9]|1[0-2])\.(\d{4})$/);

		if (!match) {
			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`❌ Formato incorrecto.

Usa MM.YYYY.

Por ejemplo:
07.2026`,
			);

			return true;
		}

		await deleteUserMessage(env, telegramChatId, telegramMessageId);

		const month = Number(match[1]);
		const year = Number(match[2]);

		await clearChatState(env.DB, chat.id);

		await showMonthStats({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			year,
			month,
			telegramMessageId: data?.flowMessageId,
		});

		return true;
	}

	return false;
}
