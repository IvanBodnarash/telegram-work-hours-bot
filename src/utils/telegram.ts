interface InlineKeyboardButton {
	text: string;
	callback_data: string;
}

interface InlineKeyboardMarkup {
	inline_keyboard: InlineKeyboardButton[][];
}

export async function sendTelegramMessage(
	botToken: string,
	chatId: number,
	threadId: number | null,
	text: string,
	replyMarkup?: InlineKeyboardMarkup,
	parseMode?: 'HTML',
): Promise<void> {
	const body: {
		chat_id: number;
		text: string;
		message_thread_id?: number;
		reply_markup?: InlineKeyboardMarkup;
		parse_mode?: 'HTML';
	} = {
		chat_id: chatId,
		text,
	};

	if (threadId !== null) {
		body.message_thread_id = threadId;
	}

	if (replyMarkup) {
		body.reply_markup = replyMarkup;
	}

	if (parseMode) {
		body.parse_mode = parseMode;
	}

	await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
}

export async function answerCallbackQuery(botToken: string, callbackQueryId: string): Promise<void> {
	await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			callback_query_id: callbackQueryId,
		}),
	});
}
