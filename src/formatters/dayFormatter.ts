import type { Chat } from '../services/chatService';

import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';

import { formatWorkSession, groupContinuousGames, mergeTimeRanges, minutesToDuration } from '../utils/time';

interface FormatDayParams {
	db: D1Database;
	chat: Chat;
	workDate: string;
}

export interface FormattedDay {
	text: string;
	totalMinutes: number;
}

export async function formatDay({ db, chat, workDate }: FormatDayParams): Promise<FormattedDay> {
	const workDay = await getWorkDayByDate(db, chat.id, workDate);

	const date = new Date(`${workDate}T12:00:00`);

	const weekday = new Intl.DateTimeFormat('es-ES', {
		timeZone: chat.timezone,
		weekday: 'long',
	}).format(date);

	const [year, month, day] = workDate.split('-');

	const formattedDate = `${day}.${month}.${year}`;

	if (!workDay) {
		return {
			text: `${formattedDate} •${capitalize(weekday)}•

No hay juegos.`,
			totalMinutes: 0,
		};
	}

	const games = await getGamesByWorkDay(db, workDay.id as number);

	if (games.length === 0) {
		return {
			text: `${formattedDate} •${capitalize(weekday)}•

No hay juegos.`,
			totalMinutes: 0,
		};
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

			if (game.clock_in && !game.clock_out) {
				return `${base}: ⬇️ ${game.clock_in}`;
			}

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

	let text = `${formattedDate} •${capitalize(weekday)}•

${gamesText}`;

	if (hoursLines.length > 0) {
		text += `

⌛ Horas ⏳
${hoursLines.join('\n')}

Total: ${minutesToDuration(totalMinutes)}`;
	}

	return {
		text,
		totalMinutes,
	};
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
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

		if (group.gameIds.length === 1) {
			return `: ⬇️ ${group.start} ⬆️ ${group.end}`;
		}

		if (index === 0) {
			return `: ⬇️ ${group.start}`;
		}

		if (index === group.gameIds.length - 1) {
			return `: ⬆️ ${group.end}`;
		}

		return '';
	}

	return '';
}
