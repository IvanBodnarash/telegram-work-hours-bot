export async function createGame(
	db: D1Database,
	workDayId: number,
	gameTypeId: number,
	scheduledTime: string,
	clientName: string,
): Promise<Game> {
	const game = await db
		.prepare(
			`
			INSERT INTO games (
				work_day_id,
				game_type_id,
				scheduled_time,
				client_name
			)
			VALUES (?, ?, ?, ?)
			RETURNING *
		`,
		)
		.bind(workDayId, gameTypeId, scheduledTime, clientName)
		.first<Game>();

	if (!game) {
		throw new Error('Failed to create game');
	}

	return game;
}

export interface Game {
	id: number;
	work_day_id: number;
	game_type_id: number;
	work_session_id: number | null;
	scheduled_time: string;
	client_name: string;
	created_at: string;
}

export interface GameWithType {
	id: number;
	work_day_id: number;
	game_type_id: number;
	work_session_id: number | null;
	scheduled_time: string;
	client_name: string;

	game_name: string;
	game_emoji: string;

	clock_in: string | null;
	clock_out: string | null;
}

export async function getGamesByWorkDay(db: D1Database, workDayId: number): Promise<GameWithType[]> {
	const result = await db
		.prepare(
			`
      SELECT
        g.id,
        g.work_day_id,
        g.game_type_id,
        g.work_session_id,
        g.scheduled_time,
        g.client_name,

        gt.name AS game_name,
        gt.emoji AS game_emoji,

        ws.clock_in,
        ws.clock_out

      FROM games g

      JOIN game_types gt
        ON g.game_type_id = gt.id

      LEFT JOIN work_sessions ws
        ON g.work_session_id = ws.id

      WHERE g.work_day_id = ?

      ORDER BY g.scheduled_time
    `,
		)
		.bind(workDayId)
		.all<GameWithType>();

	return result.results;
}

export async function getGameById(db: D1Database, gameId: number, chatId: number): Promise<GameWithType | null> {
	return await db
		.prepare(
			`
      SELECT
        g.id,
        g.work_day_id,
        g.game_type_id,
        g.work_session_id,
        g.scheduled_time,
        g.client_name,

        gt.name AS game_name,
        gt.emoji AS game_emoji,

        ws.clock_in,
        ws.clock_out

      FROM games g

      JOIN game_types gt
        ON g.game_type_id = gt.id

      JOIN work_days wd
        ON g.work_day_id = wd.id

      LEFT JOIN work_sessions ws
        ON g.work_session_id = ws.id

      WHERE g.id = ?
        AND wd.chat_id = ?
    `,
		)
		.bind(gameId, chatId)
		.first<GameWithType>();
}

export async function attachGameToSession(db: D1Database, gameId: number, workSessionId: number): Promise<void> {
	await db
		.prepare(
			`
      UPDATE games
      SET work_session_id = ?
      WHERE id = ?
    `,
		)
		.bind(workSessionId, gameId)
		.run();
}

export async function updateGameScheduledTime(db: D1Database, gameId: number, chatId: number, scheduledTime: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE games
			SET scheduled_time = ?
			WHERE id = ?
			AND work_day_id IN (
				SELECT id
				FROM work_days
				WHERE chat_id = ?
			)
		`,
		)
		.bind(scheduledTime, gameId, chatId)
		.run();
}

export async function updateGameClientName(db: D1Database, gameId: number, chatId: number, clientName: string): Promise<void> {
	await db
		.prepare(
			`
			UPDATE games
			SET client_name = ?
			WHERE id = ?
			AND work_day_id IN (
				SELECT id
				FROM work_days
				WHERE chat_id = ?
			)
		`,
		)
		.bind(clientName, gameId, chatId)
		.run();
}

export async function updateGameType(db: D1Database, gameId: number, chatId: number, gameTypeId: number): Promise<void> {
	await db
		.prepare(
			`
			UPDATE games
			SET game_type_id = ?
			WHERE id = ?
			AND work_day_id IN (
				SELECT id
				FROM work_days
				WHERE chat_id = ?
			)
		`,
		)
		.bind(gameTypeId, gameId, chatId)
		.run();
}

export async function deleteGame(db: D1Database, gameId: number, chatId: number): Promise<void> {
	await db
		.prepare(
			`
			DELETE FROM games
			WHERE id = ?
			AND work_day_id IN (
				SELECT id
				FROM work_days
				WHERE chat_id = ?
			)
		`,
		)
		.bind(gameId, chatId)
		.run();
}

export async function attachGamesToSessionRange(db: D1Database, workDayId: number, sessionId: number, endGameId: number): Promise<void> {
	const games = await getGamesByWorkDay(db, workDayId);

	const orderedGames = [...games].sort((a, b) => {
		const timeCompare = a.scheduled_time.localeCompare(b.scheduled_time);

		if (timeCompare !== 0) {
			return timeCompare;
		}

		return Number(a.id) - Number(b.id);
	});

	const startIndex = orderedGames.findIndex((game) => Number(game.work_session_id) === Number(sessionId));

	const endIndex = orderedGames.findIndex((game) => Number(game.id) === Number(endGameId));

	if (startIndex === -1 || endIndex === -1) {
		throw new Error('Game range not found');
	}

	if (endIndex < startIndex) {
		throw new Error('End game cannot be before start game');
	}

	const gamesInSession = orderedGames.slice(startIndex, endIndex + 1);

	const conflictingGame = gamesInSession.find(
		(game) => game.work_session_id !== null && Number(game.work_session_id) !== Number(sessionId),
	);

	if (conflictingGame) {
		throw new Error('Game already belongs to another session');
	}

	for (const game of gamesInSession) {
		await attachGameToSession(db, Number(game.id), sessionId);
	}
}
