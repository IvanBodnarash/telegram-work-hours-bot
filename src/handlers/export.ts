import { formatDay } from '../formatters/dayFormatter';
import type { Chat } from '../services/chatService';

import { getMonthExportRows } from '../services/exportService';

import { getCurrentDate } from '../utils/date';

import { editTelegramMessage, sendTelegramDocument, sendTelegramMessage } from '../utils/telegram';
import { minutesToDuration, timeToMinutes } from '../utils/time';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleExportParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

interface ExportMonthParams extends HandleExportParams {
	year: number;
	month: number;
	telegramMessageId?: number;
}

function escapeCsv(value: unknown): string {
	const text = String(value ?? '');

	if (text.includes(';') || text.includes('"') || text.includes('\n')) {
		return `"${text.replace(/"/g, '""')}"`;
	}

	return text;
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

export async function handleExport({ env, chat, telegramChatId, telegramThreadId }: HandleExportParams): Promise<void> {
	const months = getPreviousMonths(chat.timezone, 6);

	const buttons = months.map((item) => ({
		text: item.label,
		callback_data: `export:month:${item.year}:${item.month}`,
	}));

	const rows = [];

	for (let i = 0; i < buttons.length; i += 2) {
		rows.push(buttons.slice(i, i + 2));
	}

	await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, '📊 ¿Qué mes quieres exportar?', {
		inline_keyboard: [
			...rows,
			[
				{
					text: '📅 Otra fecha',
					callback_data: 'export:custom',
				},
			],
		],
	});
}

export async function exportMonth({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	year,
	month,
	telegramMessageId,
}: ExportMonthParams): Promise<void> {
	const rows = await getMonthExportRows(env.DB, chat.id, year, month);

	if (rows.length === 0) {
		if (telegramMessageId) {
			await editTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramMessageId, 'No hay datos para exportar este mes.');
		} else {
			await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegramChatId, telegramThreadId, 'No hay datos para exportar este mes.');
		}

		return;
	}

	const header = ['Fecha', 'Juego', 'Cliente', 'Hora juego', 'Entrada', 'Salida', 'Horas'].join(';');

	const csvRows = rows.map((row) => {
		const [year, month, day] = row.work_date.split('-');

		const displayDate = `${day}.${month}.${year}`;

		let duration = '';

		if (row.clock_in && row.clock_out) {
			const start = timeToMinutes(row.clock_in);

			const end = timeToMinutes(row.clock_out);

			if (end >= start) {
				duration = minutesToDuration(end - start);
			}
		}

		return [displayDate, row.game_name, row.client_name, row.scheduled_time, row.clock_in ?? '', row.clock_out ?? '', duration]
			.map(escapeCsv)
			.join(';');
	});

	const uniqueDates = [...new Set(rows.map((row) => row.work_date))];

	const daySummaries = await Promise.all(
		uniqueDates.map(async (workDate) => {
			const day = await formatDay({
				db: env.DB,
				chat,
				workDate,
			});

			const gamesCount = rows.filter((row) => row.work_date === workDate).length;

			return {
				workDate,
				totalMinutes: day.totalMinutes,
				nightMinutes: day.nightMinutes,
				gamesCount,
			};
		}),
	);

	const summaryHeader = ['Fecha', 'Juegos', 'Total día', 'Horas nocturnas'].join(';');

	const monthTotalMinutes = daySummaries.reduce((total, day) => total + day.totalMinutes, 0);

	const monthNightMinutes = daySummaries.reduce((total, day) => total + day.nightMinutes, 0);

	const summaryRows = daySummaries.map((day) => {
		const [year, month, date] = day.workDate.split('-');

		const displayDate = `${date}.${month}.${year}`;

		return [
			displayDate,
			day.gamesCount,
			minutesToDuration(day.totalMinutes),
			day.nightMinutes > 0 ? minutesToDuration(day.nightMinutes) : '',
		]
			.map(escapeCsv)
			.join(';');
	});

	const monthGamesCount = daySummaries.reduce((total, day) => total + day.gamesCount, 0);

	const monthTotalRow = [
		'TOTAL MES',
		monthGamesCount,
		minutesToDuration(monthTotalMinutes),
		monthNightMinutes > 0 ? minutesToDuration(monthNightMinutes) : '',
	]
		.map(escapeCsv)
		.join(';');

	const csv = '\uFEFF' + [header, ...csvRows, '', 'RESUMEN', summaryHeader, ...summaryRows, '', monthTotalRow].join('\n');

	const filename = `work-hours-${year}-${String(month).padStart(2, '0')}.csv`;

	await sendTelegramDocument(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		filename,
		csv,
		`📊 Export ${String(month).padStart(2, '0')}.${year}`,
	);
}
