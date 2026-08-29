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
