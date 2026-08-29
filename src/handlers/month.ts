import type { Chat } from '../services/chatService';

import { formatDay } from '../formatters/dayFormatter';

import { getMonthWeeks } from '../utils/date';
import { minutesToDuration } from '../utils/time';
import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleMonthParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleMonth({ env, chat, telegramChatId, telegramThreadId }: HandleMonthParams): Promise<void> {
	const weeks = getMonthWeeks(chat.timezone);

	const now = new Date();

	const local = new Intl.DateTimeFormat('en-CA', {
		timeZone: chat.timezone,
		year: 'numeric',
		month: '2-digit',
	}).format(now);

	const [year, month] = local.split('-').map(Number);

	const monthDate = new Date(Date.UTC(year, month - 1, 1));

	const monthName = new Intl.DateTimeFormat('es-ES', {
		timeZone: 'UTC',
		month: 'long',
	}).format(monthDate);

	let monthTotal = 0;

	const weekLines: string[] = [];

	const weekButtons: {
		text: string;
		callback_data: string;
	}[] = [];

	for (let index = 0; index < weeks.length; index++) {
		const week = weeks[index];

		let weekTotal = 0;

		for (const workDate of week) {
			const workDateMonth = Number(workDate.split('-')[1]);

			if (workDateMonth !== month) {
				continue;
			}

			const day = await formatDay({
				db: env.DB,
				chat,
				workDate,
			});

			weekTotal += day.totalMinutes;
		}

		monthTotal += weekTotal;

		const formatShortDate = (date: string) => {
			const [, month, day] = date.split('-');

			return `${day}.${month}`;
		};

		const firstDate = formatShortDate(week[0]);
		const lastDate = formatShortDate(week[6]);

		const duration = weekTotal > 0 ? minutesToDuration(weekTotal) : '—';

		weekLines.push(`${firstDate} - ${lastDate} — ${duration}`);

		weekButtons.push({
			text: `${firstDate} - ${lastDate}`,
			callback_data: `month:week:${index}`,
		});
	}

	const rows = [];

	for (let i = 0; i < weekButtons.length; i += 3) {
		rows.push(weekButtons.slice(i, i + 3));
	}

	const keyboard = {
		inline_keyboard: [
			...rows,
			[
				{
					text: '📄 All',
					callback_data: 'month:all',
				},
			],
		],
	};

	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`📆 ${capitalize(monthName)} ${year}

${weekLines.join('\n')}

Total: ${minutesToDuration(monthTotal)}`,
		keyboard,
	);
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
