import { getOrCreateChat } from './services/chatService';
import { getGameTypeById } from './services/gameTypeService';
import { getChatState, clearChatState, setChatState } from './services/chatStateService';
import { getOrCreateWorkDay } from './services/workDayService';
import { createGame, getGameById, attachGameToSession } from './services/gameService';
import { closeWorkSession, createWorkSession } from './services/workSessionService';
import { handleToday } from './handlers/today';
import { handleWeek } from './handlers/week';
import { handleMonth } from './handlers/month';
import { handleAdd } from './handlers/add';
import { handleGames } from './handlers/games';
import { handleEdit } from './handlers/edit';
import { handleState } from './handlers/state';
import { handleIn } from './handlers/in';
import { handleOut } from './handlers/out';
import { formatDay } from './formatters/dayFormatter';
import { sendTelegramMessage, answerCallbackQuery } from './utils/telegram';
import { getCurrentDate, getCurrentWeekDates, getMonthWeeks } from './utils/date';
import { minutesToDuration } from './utils/time';
import { getMonthEmojiByDate } from './services/monthSettingsService';

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

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
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

			if (callback.data === 'add_game:save') {
				const chatState = await getChatState(env.DB, chat.id);

				if (!chatState || chatState.state !== 'WAITING_FOR_GAME_CONFIRMATION') {
					return new Response('OK');
				}

				const data = chatState.data ? JSON.parse(chatState.data) : null;

				if (!data?.gameTypeId || !data?.scheduledTime || !data?.clientName) {
					await clearChatState(env.DB, chat.id);
					return new Response('OK');
				}

				const workDate = getCurrentDate(chat.timezone);

				const workDay = await getOrCreateWorkDay(env.DB, chat.id, workDate);

				await createGame(env.DB, workDay.id, data.gameTypeId, data.scheduledTime, data.clientName);

				await clearChatState(env.DB, chat.id);

				const gameType = await getGameTypeById(env.DB, data.gameTypeId, chat.id);

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`✅ Juego guardado

${gameType?.emoji ?? ''} ${gameType?.name ?? ''} |${data.scheduledTime}| (${data.clientName})`,
				);

				return new Response('OK');
			}

			if (callback.data === 'add_game:cancel') {
				await clearChatState(env.DB, chat.id);

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Operación cancelada.');

				return new Response('OK');
			}

			const gameTypeMatch = callback.data.match(/^add_game:(\d+)$/);

			if (gameTypeMatch) {
				const gameTypeId = Number(gameTypeMatch[1]);

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

			const inGameMatch = callback.data.match(/^in:game:(\d+)$/);

			if (inGameMatch) {
				const gameId = Number(inGameMatch[1]);

				const game = await getGameById(env.DB, gameId, chat.id);

				if (!game) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

					return new Response('OK');
				}

				await setChatState(env.DB, chat.id, 'WAITING_FOR_IN_TIME', {
					gameId: game.id,
					workDayId: game.work_day_id,
				});

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`${game.game_emoji} ${game.game_name} |${game.scheduled_time}| (${game.client_name})

Hora de entrada:`,
					{
						inline_keyboard: [
							[
								{
									text: '⏱ Ahora',
									callback_data: 'in:now',
								},
								{
									text: '✏️ Escribir',
									callback_data: 'in:manual',
								},
							],
						],
					},
				);

				return new Response('OK');
			}

			const editGameMatch = callback.data.match(/^edit:game:(\d+)$/);

			if (editGameMatch) {
				const gameId = Number(editGameMatch[1]);

				const game = await getGameById(env.DB, gameId, chat.id);

				if (!game) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Juego no encontrado.');

					return new Response('OK');
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

				return new Response('OK');
			}

			if (callback.data === 'edit:cancel') {
				await clearChatState(env.DB, chat.id);

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '❌ Edición cancelada.');

				return new Response('OK');
			}

			const weekDayMatch = callback.data?.match(/^week:day:(\d{4}-\d{2}-\d{2})$/);

			if (weekDayMatch) {
				const workDate = weekDayMatch[1];

				const day = await formatDay({
					db: env.DB,
					chat,
					workDate,
				});

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, day.text);

				return new Response('OK');
			}

			const monthWeekMatch = callback.data?.match(/^month:week:(\d+)$/);

			if (monthWeekMatch) {
				const weekIndex = Number(monthWeekMatch[1]);

				const weeks = getMonthWeeks(chat.timezone);

				const week = weeks[weekIndex];

				if (!week) {
					return new Response('OK');
				}

				const days = await Promise.all(
					week.map((workDate) =>
						formatDay({
							db: env.DB,
							chat,
							workDate,
						}),
					),
				);

				const visibleDays = days.filter((day) => day.totalMinutes > 0);

				if (visibleDays.length === 0) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay horas registradas esta semana.');

					return new Response('OK');
				}

				const totalMinutes = visibleDays.reduce((total, day) => total + day.totalMinutes, 0);

				const separatorEmoji = await getMonthEmojiByDate(env.DB, chat.id, week[0]);

				const separator = separatorEmoji.repeat(15);

				const body = visibleDays.map((day) => day.text).join(`\n\n${separator}\n\n`);

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`${body}

${separatorEmoji} POR LA SEMANA: ${minutesToDuration(totalMinutes).toUpperCase()}`,
				);

				return new Response('OK');
			}

			if (callback.data === 'in:now') {
				const chatState = await getChatState(env.DB, chat.id);

				if (!chatState || chatState.state !== 'WAITING_FOR_IN_TIME') {
					return new Response('OK');
				}

				const data = chatState.data ? JSON.parse(chatState.data) : null;

				if (!data?.gameId || !data?.workDayId) {
					await clearChatState(env.DB, chat.id);
					return new Response('OK');
				}

				const now = new Date();

				const currentTime = new Intl.DateTimeFormat('en-GB', {
					timeZone: chat.timezone,
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
				}).format(now);

				const session = await createWorkSession(env.DB, data.workDayId, currentTime);

				await attachGameToSession(env.DB, data.gameId, session.id);

				await clearChatState(env.DB, chat.id);

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Entrada registrada: ${currentTime}`);

				return new Response('OK');
			}

			if (callback.data === 'in:manual') {
				const chatState = await getChatState(env.DB, chat.id);

				if (!chatState || chatState.state !== 'WAITING_FOR_IN_TIME') {
					return new Response('OK');
				}

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`Escribe la hora de entrada.

Formato: HH:MM`,
				);

				return new Response('OK');
			}

			if (callback.data === 'out:now') {
				const chatState = await getChatState(env.DB, chat.id);

				if (!chatState || chatState.state !== 'WAITING_FOR_OUT_TIME') {
					return new Response('OK');
				}

				const data = chatState.data ? JSON.parse(chatState.data) : null;

				if (!data?.sessionId) {
					await clearChatState(env.DB, chat.id);
					return new Response('OK');
				}

				const currentTime = new Intl.DateTimeFormat('en-GB', {
					timeZone: chat.timezone,
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
				}).format(new Date());

				await closeWorkSession(env.DB, data.sessionId, currentTime);

				await clearChatState(env.DB, chat.id);

				await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, `✅ Salida registrada: ${currentTime}`);

				return new Response('OK');
			}

			if (callback.data === 'out:manual') {
				const chatState = await getChatState(env.DB, chat.id);

				if (!chatState || chatState.state !== 'WAITING_FOR_OUT_TIME') {
					return new Response('OK');
				}

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`Escribe la hora de salida.

Formato: HH:MM`,
				);

				return new Response('OK');
			}

			if (callback.data === 'week:all') {
				const dates = getCurrentWeekDates(chat.timezone);

				const days = await Promise.all(
					dates.map((workDate) =>
						formatDay({
							db: env.DB,
							chat,
							workDate,
						}),
					),
				);

				const visibleDays = days.filter((day) => day.totalMinutes > 0);

				if (visibleDays.length === 0) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay horas registradas esta semana.');

					return new Response('OK');
				}

				const totalMinutes = visibleDays.reduce((total, day) => total + day.totalMinutes, 0);

				const separatorEmoji = await getMonthEmojiByDate(env.DB, chat.id, dates[0]);

				const separator = separatorEmoji.repeat(15);

				const body = visibleDays.map((day) => day.text).join(`\n\n${separator}\n\n`);

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`${body}

${separatorEmoji} POR LA SEMANA: ${minutesToDuration(totalMinutes).toUpperCase()}`,
				);

				return new Response('OK');
			}

			if (callback.data === 'month:all') {
				const weeks = getMonthWeeks(chat.timezone);

				const dates = weeks.flat();

				const now = new Date();

				const local = new Intl.DateTimeFormat('en-CA', {
					timeZone: chat.timezone,
					year: 'numeric',
					month: '2-digit',
				}).format(now);

				const [year, month] = local.split('-').map(Number);

				const monthDates = dates.filter((date) => {
					const [dateYear, dateMonth] = date.split('-').map(Number);

					return dateYear === year && dateMonth === month;
				});

				const uniqueDates = [...new Set(monthDates)];

				const days = await Promise.all(
					uniqueDates.map((workDate) =>
						formatDay({
							db: env.DB,
							chat,
							workDate,
						}),
					),
				);

				const visibleDays = days.filter((day) => day.totalMinutes > 0);

				if (visibleDays.length === 0) {
					await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay horas registradas este mes.');

					return new Response('OK');
				}

				const totalMinutes = visibleDays.reduce((total, day) => total + day.totalMinutes, 0);

				const separatorEmoji = await getMonthEmojiByDate(env.DB, chat.id, uniqueDates[0]);

				const separator = separatorEmoji.repeat(15);

				const body = visibleDays.map((day) => day.text).join(`\n\n${separator}\n\n`);

				await sendTelegramMessage(
					env.TELEGRAM_BOT_TOKEN,
					telegramChatId,
					telegramThreadId,
					`${body}

${separatorEmoji} POR LA SEMANA: ${minutesToDuration(totalMinutes).toUpperCase()}`,
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
