-- Migration number: 0005 	 2026-09-12T16:01:10.006Z

ALTER TABLE chats
ADD COLUMN last_transient_message_id INTEGER;