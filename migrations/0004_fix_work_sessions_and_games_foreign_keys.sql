-- Migration number: 0004 	 2026-08-29T10:09:15.963Z

ALTER TABLE work_sessions RENAME TO work_sessions_old;

CREATE TABLE work_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_day_id INTEGER NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (work_day_id)
    REFERENCES work_days(id)
);

INSERT INTO work_sessions (
  id,
  work_day_id,
  clock_in,
  clock_out,
  created_at
)
SELECT
  id,
  work_day_id,
  clock_in,
  clock_out,
  created_at
FROM work_sessions_old;

DROP TABLE work_sessions_old;


ALTER TABLE games RENAME TO games_old;

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

INSERT INTO games (
  id,
  work_day_id,
  game_type_id,
  work_session_id,
  scheduled_time,
  client_name,
  created_at
)
SELECT
  id,
  work_day_id,
  game_type_id,
  work_session_id,
  scheduled_time,
  client_name,
  created_at
FROM games_old;

DROP TABLE games_old;