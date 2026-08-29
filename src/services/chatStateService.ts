export interface ChatState {
	chat_id: number;
	state: string;
	data: string | null;
	updated_at: string;
}

export async function getChatState(db: D1Database, chatId: number): Promise<ChatState | null> {
	return await db
		.prepare(
			`
      SELECT *
      FROM chat_states
      WHERE chat_id = ?
    `,
		)
		.bind(chatId)
		.first<ChatState>();
}

export async function setChatState(db: D1Database, chatId: number, state: string, data?: Record<string, unknown>): Promise<void> {
	await db
		.prepare(
			`
      INSERT INTO chat_states (
        chat_id,
        state,
        data,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)

      ON CONFLICT(chat_id)
      DO UPDATE SET
        state = excluded.state,
        data = excluded.data,
        updated_at = CURRENT_TIMESTAMP
    `,
		)
		.bind(chatId, state, data ? JSON.stringify(data) : null)
		.run();
}

export async function clearChatState(db: D1Database, chatId: number): Promise<void> {
	await db
		.prepare(
			`
      DELETE FROM chat_states
      WHERE chat_id = ?
    `,
		)
		.bind(chatId)
		.run();
}
