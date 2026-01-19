CREATE TABLE used_transactions (
  signature TEXT PRIMARY KEY,
  pda TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE letters_index (
  pda TEXT PRIMARY KEY,
  sender TEXT,
  recipient TEXT,
  status INTEGER, -- 0: Created, 1: Signed
  created_at INTEGER
);
