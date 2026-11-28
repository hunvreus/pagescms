CREATE TABLE proof_plugin (id TEXT PRIMARY KEY, value TEXT NOT NULL);
--> statement-breakpoint
INSERT INTO proof_plugin VALUES ('proof', 'migration-ok');
