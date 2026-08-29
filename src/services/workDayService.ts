export async function getWorkDayByDate(db: D1Database, chatId: number, workDate: string) {
	return await db
		.prepare(
			`
      SELECT *
      FROM work_days
      WHERE chat_id = ?
        AND work_date = ?
    `,
		)
		.bind(chatId, workDate)
		.first();
}
