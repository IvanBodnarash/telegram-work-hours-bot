export interface MonthSettings {
	id: number;
	chat_id: number;
	year: number;
	month: number;
	emoji: string;
}

export async function getMonthSettings(db: D1Database, chatId: number, year: number, month: number): Promise<MonthSettings | null> {
	return await db
		.prepare(
			`
      SELECT *
      FROM month_settings
      WHERE chat_id = ?
        AND year = ?
        AND month = ?
    `,
		)
		.bind(chatId, year, month)
		.first<MonthSettings>();
}

export async function createMonthSettings(db: D1Database, chatId: number, year: number, month: number, emoji: string): Promise<void> {
	await db
		.prepare(
			`
      INSERT INTO month_settings (
        chat_id,
        year,
        month,
        emoji
      )
      VALUES (?, ?, ?, ?)
    `,
		)
		.bind(chatId, year, month, emoji)
		.run();
}

export async function getMonthEmojiByDate(db: D1Database, chatId: number, workDate: string): Promise<string> {
	const [year, month] = workDate.split('-').map(Number);

	const settings = await getMonthSettings(db, chatId, year, month);

	return settings?.emoji ?? '🌴';
}

export async function updateMonthEmoji(db: D1Database, chatId: number, year: number, month: number, emoji: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE month_settings
			SET emoji = ?
			WHERE chat_id = ?
			AND year = ?
			AND month = ?
		`,
		)
		.bind(emoji, chatId, year, month)
		.run();
}
