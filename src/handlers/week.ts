import type { Chat } from '../services/chatService';

import { formatDay } from '../formatters/dayFormatter';

import { getCurrentWeekDates } from '../utils/date';
import { minutesToDuration } from '../utils/time';
import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleWeekParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleWeek({ env, chat, telegramChatId, telegramThreadId }: HandleWeekParams): Promise<void> {
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

	let weekTotal = 0;

	const lines = dates.map((workDate, index) => {
		const day = days[index];

		weekTotal += day.totalMinutes;

		const date = new Date(`${workDate}T12:00:00Z`);

		const weekday = new Intl.DateTimeFormat('es-ES', {
			timeZone: 'UTC',
			weekday: 'short',
		}).format(date);

		const dayNumber = workDate.split('-')[2];

		const duration = day.totalMinutes > 0 ? minutesToDuration(day.totalMinutes) : '—';

		return `${capitalize(weekday)} ${dayNumber} — ${duration}`;
	});

	const firstDate = new Date(`${dates[0]}T12:00:00Z`);

	const lastDate = new Date(`${dates[6]}T12:00:00Z`);

	const firstDay = dates[0].split('-')[2];

	const lastDay = dates[6].split('-')[2];

	const monthName = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'UTC',
		month: 'long',
	}).format(lastDate);

	const dayButtons = dates.map((date) => {
		const parsed = new Date(`${date}T12:00:00Z`);

		const weekday = new Intl.DateTimeFormat('es-ES', {
			timeZone: 'UTC',
			weekday: 'short',
		}).format(parsed);

		const day = date.split('-')[2];

		return {
			text: `${capitalize(weekday)} ${day}`,
			callback_data: `week:day:${date}`,
		};
	});

	const rows = [];

	for (let i = 0; i < dayButtons.length; i += 4) {
		rows.push(dayButtons.slice(i, i + 4));
	}

	const keyboard = {
		inline_keyboard: [
			...rows,
			[
				{
					text: '📄 All',
					callback_data: 'week:all',
				},
			],
		],
	};

	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`📅 Semana ${firstDay}–${lastDay} ${capitalize(monthName)}

${lines.join('\n')}

Total: ${minutesToDuration(weekTotal)}`,
		keyboard,
	);
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
