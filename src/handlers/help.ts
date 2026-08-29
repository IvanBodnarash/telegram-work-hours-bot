import type { Chat } from '../services/chatService';

import { sendTelegramMessage } from '../utils/telegram';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleHelpParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
}

export async function handleHelp({ env, telegramChatId, telegramThreadId }: HandleHelpParams): Promise<void> {
	await sendTelegramMessage(
		env.TELEGRAM_BOT_TOKEN,
		telegramChatId,
		telegramThreadId,
		`📖 <b>Work Hours Bot</b>

<b>/today</b>
Ver el día de hoy.

<b>/week</b>
Ver la semana actual.

<b>/month</b>
Ver el mes actual.

<b>/add</b>
Añadir un juego.
Puedes elegir hoy, ayer, anteayer o cualquier otra fecha.

<b>/in</b>
Registrar la hora de entrada.

<b>/out</b>
Registrar la hora de salida.

<b>/edit</b>
Editar juegos, cliente, horario, entrada, salida o eliminar un juego.

<b>/games</b>
Gestionar los tipos de juego.

<b>/settings</b>
Cambiar ajustes como la hora nocturna o el emoji del mes.

🌙 Las horas nocturnas se calculan desde la hora configurada en /settings.`,
		undefined,
		'HTML',
	);
}
