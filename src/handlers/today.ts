import { getWorkDayByDate } from '../services/workDayService';
import { getGamesByWorkDay } from '../services/gameService';
import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface Chat {
	id: number;
	timezone: string;
}

interface HandleTodayParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
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

	const gamesText = games
		.map((game) => {
			let line = `${game.game_emoji} ${game.game_name} ` + `|${game.scheduled_time}| (${game.client_name})`;

			if (game.clock_in) {
				line += `: ⬇️ ${game.clock_in}`;
			}

			if (game.clock_out) {
				line += ` ⬆️ ${game.clock_out}`;
			}

			return line;
		})
		.join('\n');

	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`${formattedDate} •${capitalize(weekday)}•

${gamesText}`,
	);
}

function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
