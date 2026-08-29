import type { Chat } from '../services/chatService';

import { formatDay } from '../formatters/dayFormatter';

import { getCurrentWeekDates, getMonthWeeks } from '../utils/date';

import { minutesToDuration } from '../utils/time';

import { getMonthEmojiByDate } from '../services/monthSettingsService';

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

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function handleReportCallbacks({ env, chat, telegramChatId, telegramThreadId, callbackData }: Params): Promise<boolean> {
	const weekDayMatch = callbackData.match(/^week:day:(\d{4}-\d{2}-\d{2})$/);

	if (weekDayMatch) {
		const workDate = weekDayMatch[1];

		const day = await formatDay({
			db: env.DB,
			chat,
			workDate,
		});

		await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, day.text, undefined, 'HTML');

		return true;
	}

	const monthWeekMatch = callbackData.match(/^month:week:(\d+)$/);

	if (monthWeekMatch) {
		const weekIndex = Number(monthWeekMatch[1]);

		const weeks = getMonthWeeks(chat.timezone);

		const week = weeks[weekIndex];

		if (!week) {
			return true;
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

			return true;
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

${separatorEmoji} POR LA SEMANA: <b>${minutesToDuration(totalMinutes).toUpperCase()}</b>`,
			undefined,
			'HTML',
		);

		return true;
	}

	if (callbackData === 'week:all') {
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

			return true;
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

${separatorEmoji} POR LA SEMANA: <b>${minutesToDuration(totalMinutes).toUpperCase()}</b>`,
			undefined,
			'HTML',
		);

		return true;
	}

	if (callbackData === 'month:all') {
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

			return true;
		}

		const totalMinutes = visibleDays.reduce((total, day) => total + day.totalMinutes, 0);

		const separatorEmoji = await getMonthEmojiByDate(env.DB, chat.id, uniqueDates[0]);

		const separator = separatorEmoji.repeat(15);

		const body = visibleDays.map((day) => day.text).join(`\n\n${separator}\n\n`);

		const monthName = new Intl.DateTimeFormat('es-ES', {
			timeZone: 'UTC',
			month: 'long',
		}).format(new Date(Date.UTC(year, month - 1, 1)));

		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			telegramChatId,
			telegramThreadId,
			`${body}

${separatorEmoji} TOTAL ${capitalize(monthName)}: <b>${minutesToDuration(totalMinutes).toUpperCase()}</b>`,
			undefined,
			'HTML',
		);

		return true;
	}

	return false;
}
