export async function createGame(
	db: D1Database,
	workDayId: number,
	gameTypeId: number,
	scheduledTime: string,
	clientName: string,
): Promise<void> {
	await db
		.prepare(
			`
      INSERT INTO games (
        work_day_id,
        game_type_id,
        scheduled_time,
        client_name
      )
      VALUES (?, ?, ?, ?)
    `,
		)
		.bind(workDayId, gameTypeId, scheduledTime, clientName)
		.run();
}
