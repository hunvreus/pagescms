-- Retain genuine file-change metadata; old snapshot revisions are not file-change commits.
UPDATE cache_file SET
  commit_sha = CASE WHEN change_commit_sha IS NOT NULL AND commit_timestamp IS NOT NULL THEN change_commit_sha ELSE NULL END,
  commit_timestamp = CASE WHEN change_commit_sha IS NOT NULL AND commit_timestamp IS NOT NULL THEN commit_timestamp ELSE NULL END;
--> statement-breakpoint
ALTER TABLE `cache_file` DROP COLUMN `change_commit_sha`;
