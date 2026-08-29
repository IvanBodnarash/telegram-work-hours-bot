import type { Chat } from '../services/chatService';
import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';
import { sendTelegramMessage } from '../utils/telegram';
import { formatWorkSession, groupContinuousGames, mergeTimeRanges, minutesToDuration } from '../utils/time';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleTodayParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

function getGameTimeMarkers(
	gameId: number,
	groups: {
		gameIds: number[];
		start: string;
		end: string;
	}[],
): string {
	for (const group of groups) {
		const index = group.gameIds.indexOf(gameId);

		if (index === -1) {
			continue;
		}

		// One game in the group
		if (group.gameIds.length === 1) {
			return `: ⬇️ ${group.start} ⬆️ ${group.end}`;
		}

		// First game
		if (index === 0) {
			return `: ⬇️ ${group.start}`;
		}

		// The last game
		if (index === group.gameIds.length - 1) {
			return `: ⬆️ ${group.end}`;
		}

		// Game in the middle
		return '';
	}

	return '';
}

export async function handleToday({ env, chat, telegramChatId, telegramThreadId }: HandleTodayParams) {
	const now = new Date();

	const dateParts = new Intl.DateTimeFormat('en-CA', {
		timeZone: chat.timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(now);

	const year = dateParts.find((part) => part.type === 'year')?.value;
	const month = dateParts.find((part) => part.type === 'month')?.value;
	const day = dateParts.find((part) => part.type === 'day')?.value;

	const workDate = `${year}-${month}-${day}`;

	const workDay = await getWorkDayByDate(env.DB, chat.id, workDate);

	const weekday = new Intl.DateTimeFormat('es-ES', {
		timeZone: chat.timezone,
		weekday: 'long',
	}).format(now);

	const formattedDate = `${day}.${month}.${year}`;

	if (!workDay) {
		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${formattedDate} •${capitalize(weekday)}•

No hay juegos para hoy.`,
		);

		return;
	}

	const games = await getGamesByWorkDay(env.DB, workDay.id as number);

	if (games.length === 0) {
		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${formattedDate} •${capitalize(weekday)}•

No hay juegos para hoy.`,
		);

		return;
	}

	const gameRanges = games
		.filter((game) => game.clock_in && game.clock_out)
		.map((game) => ({
			gameId: game.id,
			start: game.clock_in!,
			end: game.clock_out!,
		}));

	const continuousGroups = groupContinuousGames(gameRanges);

	const gamesText = games
		.map((game) => {
			const base = `${game.game_emoji} ${game.game_name} ` + `|${game.scheduled_time}| (${game.client_name})`;

			// If session is open
			if (game.clock_in && !game.clock_out) {
				return `${base}: ⬇️ ${game.clock_in}`;
			}

			// If session is closed
			if (game.clock_in && game.clock_out) {
				return base + getGameTimeMarkers(game.id, continuousGroups);
			}

			return base;
		})
		.join('\n');

	const sessions = new Map<
		number,
		{
			start: string;
			end: string;
		}
	>();

	for (const game of games) {
		if (game.work_session_id !== null && game.clock_in && game.clock_out) {
			sessions.set(game.work_session_id, {
				start: game.clock_in,
				end: game.clock_out,
			});
		}
	}

	const mergedSessions = mergeTimeRanges(Array.from(sessions.values()));

	const hoursLines: string[] = [];
	let totalMinutes = 0;

	for (const session of mergedSessions) {
		const formatted = formatWorkSession(session.start, session.end, chat.night_start);

		hoursLines.push(...formatted.lines);
		totalMinutes += formatted.totalMinutes;
	}

	let response = `${formattedDate} •${capitalize(weekday)}•

${gamesText}`;

	if (hoursLines.length > 0) {
		response += `

⌛ Horas ⏳
${hoursLines.join('\n')}

Total: ${minutesToDuration(totalMinutes)}`;
	}

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, response);
}

function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
