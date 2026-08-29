export interface GameType {
	id: number;
	chat_id: number;
	name: string;
	emoji: string;
}

export async function getGameTypes(db: D1Database, chatId: number): Promise<GameType[]> {
	const result = await db
		.prepare(
			`
      SELECT *
      FROM game_types
      WHERE chat_id = ?
      ORDER BY name
    `,
		)
		.bind(chatId)
		.all<GameType>();

	return result.results;
}

export async function createGameType(db: D1Database, chatId: number, name: string, emoji: string): Promise<void> {
	await db
		.prepare(
			`
      INSERT INTO game_types (
        chat_id,
        name,
        emoji
      )
      VALUES (?, ?, ?)
    `,
		)
		.bind(chatId, name, emoji)
		.run();
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
