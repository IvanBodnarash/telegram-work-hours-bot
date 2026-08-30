import type { Chat } from '../services/chatService';

import { getMonthGameCounts } from '../services/statsService';

import { formatDay } from '../formatters/dayFormatter';

import { getCurrentDate } from '../utils/date';

import { minutesToDuration } from '../utils/time';

import { editTelegramMessage, sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleStatsParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

interface ShowMonthStatsParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	year: number;
	month: number;
	telegramMessageId?: number;
}

function getPreviousMonths(timezone: string, count: number) {
	const currentDate = getCurrentDate(timezone);

	const [year, month] = currentDate.split('-').map(Number);

	const result = [];

	for (let i = 0; i < count; i++) {
		const date = new Date(Date.UTC(year, month - 1 - i, 1));

		result.push({
			year: date.getUTCFullYear(),
			month: date.getUTCMonth() + 1,
			label: new Intl.DateTimeFormat('es-ES', {
				month: 'short',
				year: 'numeric',
				timeZone: 'UTC',
			}).format(date),
		});
	}

	return result;
}

function getMonthDates(year: number, month: number): string[] {
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

	const result: string[] = [];

	for (let day = 1; day <= lastDay; day++) {
		result.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
	}

	return result;
}

export async function handleStats({ env, chat, telegramChatId, telegramThreadId }: HandleStatsParams): Promise<void> {
	const months = getPreviousMonths(chat.timezone, 6);

	const buttons = months.map((item) => ({
		text: item.label,
		callback_data: `stats:month:${item.year}:${item.month}`,
	}));

	const rows = [];

	for (let i = 0; i < buttons.length; i += 2) {
		rows.push(buttons.slice(i, i + 2));
	}

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '📊 ¿Qué mes quieres ver?', {
		inline_keyboard: [
			...rows,
			[
				{
					text: '📅 Otra fecha',
					callback_data: 'stats:custom',
				},
			],
		],
	});
}

export async function showMonthStats({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	year,
	month,
	telegramMessageId,
}: ShowMonthStatsParams): Promise<void> {
	const dates = getMonthDates(year, month);

	const days = await Promise.all(
		dates.map((workDate) =>
			formatDay({
				db: env.DB,
				chat,
				workDate,
			}),
		),
	);

	const workedDays = days.filter((day) => day.totalMinutes > 0);

	const totalMinutes = workedDays.reduce((total, day) => total + day.totalMinutes, 0);

	const averageMinutes = workedDays.length > 0 ? Math.round(totalMinutes / workedDays.length) : 0;

	const gameCounts = await getMonthGameCounts(env.DB, chat.id, year, month);

	const totalGames = gameCounts.reduce((total, game) => total + game.count, 0);

	const topGames =
		gameCounts.length > 0
			? gameCounts
					.slice(0, 5)
					.map((game, index) => `${index + 1}. ${game.game_emoji} ${game.game_name} — ${game.count}`)
					.join('\n')
			: '—';

	const monthName = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'UTC',
		month: 'long',
		year: 'numeric',
	}).format(new Date(Date.UTC(year, month - 1, 1)));

	const text = `📊 <b>Estadísticas — ${monthName}</b>

⏱ Horas: <b>${minutesToDuration(totalMinutes)}</b>
📅 Días trabajados: <b>${workedDays.length}</b>
🎮 Juegos: <b>${totalGames}</b>
📈 Media por día: <b>${minutesToDuration(averageMinutes)}</b>

<b>Top juegos</b>
${topGames}`;

	if (telegramMessageId) {
		await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, text, undefined, 'HTML');
	} else {
		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, text, undefined, 'HTML');
	}
}
