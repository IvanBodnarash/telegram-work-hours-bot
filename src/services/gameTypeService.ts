export interface GameType {
	id: number;
	chat_id: number;
	name: string;
	emoji: string;
	is_active: number;
}

export async function getGameTypes(db: D1Database, chatId: number): Promise<GameType[]> {
	const result = await db
		.prepare(
			`
      SELECT *
      FROM game_types
			WHERE chat_id = ?
			  AND is_active = 1
      ORDER BY name
    `,
		)
		.bind(chatId)
		.all<GameType>();

	return result.results;
}

export async function createGameType(
	db: D1Database,
	chatId: number,
	name: string,
	emoji: string,
): Promise<GameType> {
	const gameType = await db
		.prepare(
			`
			INSERT INTO game_types (
				chat_id,
				name,
				emoji,
				is_active
			)
			VALUES (?, ?, ?, 1)

			ON CONFLICT(chat_id, name)
			DO UPDATE SET
				emoji = excluded.emoji,
				is_active = 1

			RETURNING *
		`,
		)
		.bind(chatId, name, emoji)
		.first<GameType>();

	if (!gameType) {
		throw new Error('Failed to create game type');
	}

	return gameType;
}

export async function getGameTypeById(db: D1Database, gameTypeId: number, chatId: number): Promise<GameType | null> {
	return await db
		.prepare(
			`
      SELECT *
      FROM game_types
      WHERE id = ?
        AND chat_id = ?
    `,
		)
		.bind(gameTypeId, chatId)
		.first<GameType>();
}

export async function deactivateGameType(
	db: D1Database,
	gameTypeId: number,
	chatId: number,
): Promise<void> {
	await db
		.prepare(
			`
			UPDATE game_types
			SET is_active = 0
			WHERE id = ?
			  AND chat_id = ?
		`,
		)
		.bind(gameTypeId, chatId)
		.run();
}