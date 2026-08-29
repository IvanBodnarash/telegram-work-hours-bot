interface WorkDay {
	id: number;
	chat_id: number;
	work_date: string;
	created_at: string;
}

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

export async function getOrCreateWorkDay(db: D1Database, chatId: number, workDate: string): Promise<WorkDay> {
	const existing = await db
		.prepare(
			`
      SELECT *
      FROM work_days
      WHERE chat_id = ?
        AND work_date = ?
    `,
		)
		.bind(chatId, workDate)
		.first<WorkDay>();

	if (existing) {
		return existing;
	}

	await db
		.prepare(
			`
      INSERT INTO work_days (
        chat_id,
        work_date
      )
      VALUES (?, ?)
    `,
		)
		.bind(chatId, workDate)
		.run();

	const created = await db
		.prepare(
			`
      SELECT *
      FROM work_days
      WHERE chat_id = ?
        AND work_date = ?
    `,
		)
		.bind(chatId, workDate)
		.first<WorkDay>();

	if (!created) {
		throw new Error('Failed to create work day');
	}

	return created;
}
