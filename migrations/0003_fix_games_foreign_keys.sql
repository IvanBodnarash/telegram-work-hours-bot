-- Migration number: 0003 	 2026-08-29T09:45:48.164Z

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