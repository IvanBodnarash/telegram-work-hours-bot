export interface TelegramChatData {
	telegramChatId: number;
	telegramThreadId: number | null;
	chatType: string;
	chatName: string | null;
}

export interface Chat {
	id: number;
	telegram_chat_id: number;
	telegram_thread_id: number | null;
	chat_type: string;
	chat_name: string | null;
	timezone: string;
	night_start: string;
	created_at: string;
}

export async function getOrCreateChat(db: D1Database, data: TelegramChatData): Promise<Chat> {
	const existingChat = await db
		.prepare(
			`
      SELECT *
      FROM chats
      WHERE telegram_chat_id = ?
        AND (
          telegram_thread_id = ?
          OR (telegram_thread_id IS NULL AND ? IS NULL)
        )
    `,
		)
		.bind(data.telegramChatId, data.telegramThreadId, data.telegramThreadId)
		.first<Chat>();

	if (existingChat) {
		return existingChat;
	}

	await db
		.prepare(
			`
      INSERT INTO chats (
        telegram_chat_id,
        telegram_thread_id,
        chat_type,
        chat_name
      )
      VALUES (?, ?, ?, ?)
    `,
		)
		.bind(data.telegramChatId, data.telegramThreadId, data.chatType, data.chatName)
		.run();

	const createdChat = await db
		.prepare(
			`
      SELECT *
      FROM chats
      WHERE telegram_chat_id = ?
        AND (
          telegram_thread_id = ?
          OR (telegram_thread_id IS NULL AND ? IS NULL)
        )
    `,
		)
		.bind(data.telegramChatId, data.telegramThreadId, data.telegramThreadId)
		.first<Chat>();

	if (!createdChat) {
		throw new Error('Failed to create chat');
	}

	return createdChat;
}

export async function updateNightStart(db: D1Database, chatId: number, nightStart: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE chats
			SET night_start = ?
			WHERE id = ?
		`,
		)
		.bind(nightStart, chatId)
		.run();
}
