import type { Chat } from '../services/chatService';

import { handleAddCallbacks } from './addCallbacks';
import { handleEditCallbacks } from './editCallbacks';
import { handleExportCallbacks } from './exportCallbacks';
import { handleReportCallbacks } from './reportCallbacks';
import { handleSettingsCallbacks } from './settingsCallbacks';
import { handleStatsCallbacks } from './statsCallbacks';
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
	telegramMessageId: number;
	callbackData: string;
}

export async function handleCallback({
	env,
	chat,
	telegramChatId,
	telegramThreadId,
	telegramMessageId,
	callbackData,
}: HandleCallbackParams): Promise<boolean> {
	const params = {
		env,
		chat,
		telegramChatId,
		telegramThreadId,
		telegramMessageId,
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

	if (await handleExportCallbacks(params)) {
		return true;
	}

	if (await handleStatsCallbacks(params)) {
		return true;
	}

	return false;
}
