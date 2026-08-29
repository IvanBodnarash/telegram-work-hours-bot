import type { Chat } from '../services/chatService';

import { handleAddCallbacks } from './addCallbacks';
import { handleEditCallbacks } from './editCallbacks';
import { handleReportCallbacks } from './reportCallbacks';
import { handleSettingsCallbacks } from './settingsCallbacks';
import { handleWorkCallbacks } from './workCallbacks';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN: string;
}

interface HandleCallbackParams {
	env: Env;
	chat: Chat;
	telegramChatId: number;
	telegramThreadId: number | null;
	callbackData: string;
}

export async function handleCallback({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	callbackData,
}: HandleCallbackParams): Promise<boolean> {
	const params = {
		env,
		chat,
		telegramChatId,
		telegramThreadId,
		callbackData,
	};

	if (await handleAddCallbacks(params)) {
		return true;
	}

	if (await handleWorkCallbacks(params)) {
		return true;
	}

	if (await handleEditCallbacks(params)) {
		return true;
	}

	if (await handleReportCallbacks(params)) {
		return true;
	}

	if (await handleSettingsCallbacks(params)) {
		return true;
	}

	return false;
}
