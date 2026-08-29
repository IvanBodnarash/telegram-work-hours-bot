-- 1. channels -> chats

ALTER TABLE channels RENAME TO chats;

ALTER TABLE chats
RENAME COLUMN telegram_channel_id TO telegram_chat_id;

ALTER TABLE chats
RENAME COLUMN channel_name TO chat_name;

ALTER TABLE chats
ADD COLUMN telegram_thread_id INTEGER;

ALTER TABLE chats
ADD COLUMN chat_type TEXT NOT NULL DEFAULT 'channel';


-- 2. month_settings: channel_id -> chat_id

ALTER TABLE month_settings RENAME TO month_settings_old;

CREATE TABLE month_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  emoji TEXT NOT NULL,

  FOREIGN KEY (chat_id)
    REFERENCES chats(id),

  UNIQUE(chat_id, year, month)
);

INSERT INTO month_settings (
  id,
  chat_id,
  year,
  month,
  emoji
)
SELECT
  id,
  channel_id,
  year,
  month,
  emoji
FROM month_settings_old;

DROP TABLE month_settings_old;


-- 3. game_types: channel_id -> chat_id

ALTER TABLE game_types RENAME TO game_types_old;

CREATE TABLE game_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,

  FOREIGN KEY (chat_id)
    REFERENCES chats(id),

  UNIQUE(chat_id, name)
);

INSERT INTO game_types (
  id,
  chat_id,
  name,
  emoji
)
SELECT
  id,
  channel_id,
  name,
  emoji
FROM game_types_old;

DROP TABLE game_types_old;


-- 4. work_days: channel_id -> chat_id

ALTER TABLE work_days RENAME TO work_days_old;

CREATE TABLE work_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (chat_id)
    REFERENCES chats(id),

  UNIQUE(chat_id, work_date)
);

INSERT INTO work_days (
  id,
  chat_id,
  work_date,
  created_at
)
SELECT
  id,
  channel_id,
  work_date,
  created_at
FROM work_days_old;

DROP TABLE work_days_old;


-- 5. channel_states -> chat_states

ALTER TABLE channel_states RENAME TO channel_states_old;

CREATE TABLE chat_states (
  chat_id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (chat_id)
    REFERENCES chats(id)
);

INSERT INTO chat_states (
  chat_id,
  state,
  data,
  updated_at
)
SELECT
  channel_id,
  state,
  data,
  updated_at
FROM channel_states_old;

DROP TABLE channel_states_old;