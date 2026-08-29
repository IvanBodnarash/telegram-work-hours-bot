import { updateNightStart, type Chat } from '../services/chatService';
import { getChatState, clearChatState, setChatState } from '../services/chatStateService';
import { attachGameToSession, updateGameClientName, updateGameScheduledTime } from '../services/gameService';
import { createGameType, getGameTypeById } from '../services/gameTypeService';
import { createMonthSettings } from '../services/monthSettingsService';
import { closeWorkSession, createWorkSession, updateWorkSessionClockIn, updateWorkSessionClockOut } from '../services/workSessionService';
import { getCurrentDate, parseDisplayDate } from '../utils/date';
import { sendTelegramMessage } from '../utils/telegram';
import { timeToMinutes } from '../utils/time';
import { startAddForDate } from './add';
import { startEditForDate } from './edit';
import { startInForDate } from './in';
import { startOutForDate } from './out';

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

		if (!data?.year || !data?.month) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const emoji = text.trim();

		if (!isSingleEmoji(emoji)) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Envía solo un emoji.');

			return true;
		}

		await createMonthSettings(env.DB, chat.id, data.year, data.month, emoji);

		const workDate = data.workDate;

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Emoji guardado: ${emoji}`);

		if (workDate) {
			await startAddForDate({
				env,
				chat,
				telegramChatId,
				telegramThreadId,
				workDate,
			});
		}

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
			workDate: data.workDate,
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

		if (!data?.gameTypeId || !data?.scheduledTime || !data?.workDate) {
			await clearChatState(env.DB, chat.id);
			return true;
		}

		const clientName = text.trim();

		if (!clientName) {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ El nombre no puede estar vacío.');

			return true;
		}

		const today = getCurrentDate(chat.timezone);

		if (data.workDate !== today) {
			await setChatState(env.DB, chat.id, 'WAITING_FOR_PAST_GAME_CLOCK_IN', {
				gameTypeId: data.gameTypeId,
				scheduledTime: data.scheduledTime,
				clientName,
				workDate: data.workDate,
			});

			await sendTelegramMessage(
				env.TELEGRAM_BOT_TOKEN,
				telegramChatId,
				telegramThreadId,
				`Hora de entrada:

Formato: HH:MM`,
			);

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
		});

		const [year, month, day] = data.workDate.split('-');

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${gameType.emoji} ${gameType.name} |${data.scheduledTime}| (${clientName})

📅 ${day}.${month}.${year}

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

		await updateWorkSessionClockIn(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada actualizada: ${time}`);

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

		await updateWorkSessionClockOut(env.DB, data.sessionId, time);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida actualizada: ${time}`);

		return true;
	}

	if (chatState.state === 'WAITING_FOR_ADD_DATE') {
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

		await clearChatState(env.DB, chat.id);

		await startAddForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
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

		await setChatState(env.DB, chat.id, 'WAITING_FOR_PAST_GAME_CLOCK_OUT', {
			...data,
			clockIn,
		});

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`Hora de salida:

Formato: HH:MM`,
		);

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

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${gameType.emoji} ${gameType.name} |${data.scheduledTime}| (${data.clientName})

📅 ${day}.${month}.${year}
⬇️ ${data.clockIn}
⬆️ ${clockOut}

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

	if (chatState.state === 'WAITING_FOR_IN_DATE') {
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

		await clearChatState(env.DB, chat.id);

		await startInForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_OUT_DATE') {
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

		await clearChatState(env.DB, chat.id);

		await startOutForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_EDIT_DATE') {
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

		await clearChatState(env.DB, chat.id);

		await startEditForDate({
			env,
			chat,
			telegramChatId,
			telegramThreadId,
			workDate,
		});

		return true;
	}

	if (chatState.state === 'WAITING_FOR_NIGHT_START') {
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

		await updateNightStart(env.DB, chat.id, time);

		await clearChatState(env.DB, chat.id);

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Inicio nocturno actualizado: ${time}`);

		return true;
	}

	return false;
}
