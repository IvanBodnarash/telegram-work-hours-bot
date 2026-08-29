export interface GameCountRow {
	game_name: string;
	game_emoji: string;
	count: number;
}

export async function getMonthGameCounts(db: D1Database, chatId: number, year: number, month: number): Promise<GameCountRow[]> {
	const prefix = `${year}-${String(month).padStart(2, '0')}`;

	const result = await db
		.prepare(
			`
			SELECT
				gt.name AS game_name,
				gt.emoji AS game_emoji,
				COUNT(*) AS count
			FROM games g
			JOIN work_days wd
				ON wd.id = g.work_day_id
			JOIN game_types gt
				ON gt.id = g.game_type_id
			WHERE wd.chat_id = ?
			AND wd.work_date LIKE ?
			GROUP BY gt.id, gt.name, gt.emoji
			ORDER BY count DESC
		`,
		)
		.bind(chatId, `${prefix}%`)
		.all<GameCountRow>();

	return result.results;
}
