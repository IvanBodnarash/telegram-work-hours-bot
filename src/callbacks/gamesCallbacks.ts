import type { Chat } from '../services/chatService';

import { setChatState } from '../services/chatStateService';

import {
  deactivateGameType,
  getGameTypeById,
  getGameTypes,
} from '../services/gameTypeService';

import { handleGames } from '../handlers/games';

import { editTelegramMessage } from '../utils/telegram';

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
}

interface Params {
  env: Env;
  chat: Chat;
  telegramChatId: number;
  telegramThreadId: number | null;
  telegramMessageId: number;
  callbackData: string;
}

export async function handleGamesCallbacks({
  env,
  chat,
  telegramChatId,
  telegramThreadId,
  telegramMessageId,
  callbackData,
}: Params): Promise<boolean> {
  if (callbackData === 'games:add') {
    await setChatState(
      env.DB,
      chat.id,
      'WAITING_FOR_GAME_NAME',
      {
        flowMessageId: telegramMessageId,
      },
    );

    await editTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      telegramChatId,
      telegramMessageId,
      'Nombre del juego:',
    );

    return true;
  }

  if (callbackData === 'games:delete') {
    const gameTypes = await getGameTypes(
      env.DB,
      chat.id,
    );

    if (gameTypes.length === 0) {
      await editTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        telegramChatId,
        telegramMessageId,
        'No hay juegos para eliminar.',
        {
          inline_keyboard: [
            [
              {
                text: '⬅️ Volver',
                callback_data: 'games:list',
              },
            ],
          ],
        },
      );

      return true;
    }

    const keyboard = {
      inline_keyboard: [
        ...gameTypes.map((gameType) => [
          {
            text: `${gameType.emoji} ${gameType.name}`,
            callback_data: `games:delete_select:${gameType.id}`,
          },
        ]),
        [
          {
            text: '⬅️ Volver',
            callback_data: 'games:list',
          },
        ],
      ],
    };

    await editTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      telegramChatId,
      telegramMessageId,
      '¿Qué juego quieres eliminar de la lista?',
      keyboard,
    );

    return true;
  }

  const deleteSelectMatch = callbackData.match(
    /^games:delete_select:(\d+)$/,
  );

  if (deleteSelectMatch) {
    const gameTypeId = Number(
      deleteSelectMatch[1],
    );

    const gameType = await getGameTypeById(
      env.DB,
      gameTypeId,
      chat.id,
    );

    if (!gameType) {
      await editTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        telegramChatId,
        telegramMessageId,
        '❌ Juego no encontrado.',
      );

      return true;
    }

    await editTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      telegramChatId,
      telegramMessageId,
      `⚠️ ¿Eliminar este juego de la lista?

${gameType.emoji} ${gameType.name}

Los registros anteriores no se eliminarán.`,
      {
        inline_keyboard: [
          [
            {
              text: '🗑 Sí, eliminar',
              callback_data: `games:delete_confirm:${gameType.id}`,
            },
          ],
          [
            {
              text: '❌ Cancelar',
              callback_data: 'games:delete',
            },
          ],
        ],
      },
    );

    return true;
  }

  const deleteConfirmMatch = callbackData.match(
    /^games:delete_confirm:(\d+)$/,
  );

  if (deleteConfirmMatch) {
    const gameTypeId = Number(
      deleteConfirmMatch[1],
    );

    const gameType = await getGameTypeById(
      env.DB,
      gameTypeId,
      chat.id,
    );

    if (!gameType) {
      await editTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        telegramChatId,
        telegramMessageId,
        '❌ Juego no encontrado.',
      );

      return true;
    }

    await deactivateGameType(
      env.DB,
      gameTypeId,
      chat.id,
    );

    await editTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      telegramChatId,
      telegramMessageId,
      `✅ Juego eliminado de la lista:

${gameType.emoji} ${gameType.name}`,
      {
        inline_keyboard: [
          [
            {
              text: '⬅️ Volver a juegos',
              callback_data: 'games:list',
            },
          ],
        ],
      },
    );

    return true;
  }

  if (callbackData === 'games:list') {
    await handleGames({
      env,
      chat,
      telegramChatId,
      telegramThreadId,
      telegramMessageId,
    });

    return true;
  }

  return false;
}