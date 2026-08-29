export interface ExportRow {
	work_date: string;
	game_name: string;
	game_emoji: string;
	scheduled_time: string;
	client_name: string;
	clock_in: string | null;
	clock_out: string | null;
}

export async function getMonthExportRows(db: D1Database, chatId: number, year: number, month: number): Promise<ExportRow[]> {
	const monthString = String(month).padStart(2, '0');
	const prefix = `${year}-${monthString}`;

	const result = await db
		.prepare(
			`
			SELECT
				wd.work_date,
				gt.name AS game_name,
				gt.emoji AS game_emoji,
				g.scheduled_time,
				g.client_name,
				ws.clock_in,
				ws.clock_out
			FROM games g
			JOIN work_days wd
				ON wd.id = g.work_day_id
			JOIN game_types gt
				ON gt.id = g.game_type_id
			LEFT JOIN work_sessions ws
				ON ws.id = g.work_session_id
			WHERE wd.chat_id = ?
				AND wd.work_date LIKE ?
			ORDER BY
				wd.work_date ASC,
				g.scheduled_time ASC
		`,
		)
		.bind(chatId, `${prefix}%`)
		.all<ExportRow>();

	return result.results;
}
