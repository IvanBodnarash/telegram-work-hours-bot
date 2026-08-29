export interface WorkSession {
	id: number;
	work_day_id: number;
	clock_in: string;
	clock_out: string | null;
}

export async function createWorkSession(db: D1Database, workDayId: number, clockIn: string): Promise<WorkSession> {
	const result = await db
		.prepare(
			`
      INSERT INTO work_sessions (
        work_day_id,
        clock_in
      )
      VALUES (?, ?)
      RETURNING *
    `,
		)
		.bind(workDayId, clockIn)
		.first<WorkSession>();

	if (!result) {
		throw new Error('Failed to create work session');
	}

	return result;
}

export async function getOpenWorkSession(db: D1Database, workDayId: number): Promise<WorkSession | null> {
	return await db
		.prepare(
			`
      SELECT *
      FROM work_sessions
      WHERE work_day_id = ?
        AND clock_out IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
		)
		.bind(workDayId)
		.first<WorkSession>();
}

export async function closeWorkSession(db: D1Database, sessionId: number, clockOut: string): Promise<void> {
	await db
		.prepare(
			`
      UPDATE work_sessions
      SET clock_out = ?
      WHERE id = ?
    `,
		)
		.bind(clockOut, sessionId)
		.run();
}

export async function updateWorkSessionClockIn(db: D1Database, sessionId: number, clockIn: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE work_sessions
			SET clock_in = ?
			WHERE id = ?
		`,
		)
		.bind(clockIn, sessionId)
		.run();
}

export async function updateWorkSessionClockOut(db: D1Database, sessionId: number, clockOut: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE work_sessions
			SET clock_out = ?
			WHERE id = ?
		`,
		)
		.bind(clockOut, sessionId)
		.run();
}
