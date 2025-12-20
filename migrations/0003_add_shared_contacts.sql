-- Migration number: 0003 	 2025-12-20T16:30:00.000Z

CREATE TABLE shared_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_token TEXT UNIQUE NOT NULL,
  contact_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  contact_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  views INTEGER DEFAULT 0,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_shared_contacts_token ON shared_contacts(share_token);
CREATE INDEX idx_shared_contacts_contact_id ON shared_contacts(contact_id);
