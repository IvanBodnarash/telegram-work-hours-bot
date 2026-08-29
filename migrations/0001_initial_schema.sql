-- Migration number: 0001 	 2026-08-28T18:36:31.576Z

CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_channel_id INTEGER NOT NULL UNIQUE,
  channel_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
  night_start TEXT NOT NULL DEFAULT '22:00',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE month_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  emoji TEXT NOT NULL,

  FOREIGN KEY (channel_id)
    REFERENCES channels(id),

  UNIQUE(channel_id, year, month)
);

CREATE TABLE game_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,

  FOREIGN KEY (channel_id)
    REFERENCES channels(id),

  UNIQUE(channel_id, name)
);

CREATE TABLE work_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (channel_id)
    REFERENCES channels(id),

  UNIQUE(channel_id, work_date)
);

CREATE TABLE work_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_day_id INTEGER NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (work_day_id)
    REFERENCES work_days(id)
);

CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_day_id INTEGER NOT NULL,
  game_type_id INTEGER NOT NULL,
  work_session_id INTEGER,
  scheduled_time TEXT NOT NULL,
  client_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (work_day_id)
    REFERENCES work_days(id),

  FOREIGN KEY (game_type_id)
    REFERENCES game_types(id),

  FOREIGN KEY (work_session_id)
    REFERENCES work_sessions(id)
);

CREATE TABLE channel_states (
  channel_id INTEGER PRIMARY KEY,
  state TEXT NOT NULL,
  data TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (channel_id)
    REFERENCES channels(id)
);