ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account"
SET
	"issuer" = 'local:credential',
	"account_id" = "user_id"
WHERE "provider_id" = 'credential';--> statement-breakpoint
UPDATE "account"
SET "issuer" = 'local:oauth:github'
WHERE "provider_id" = 'github';--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
		RAISE EXCEPTION 'Cannot migrate Better Auth accounts: account provider has no trusted issuer mapping';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "account"
		GROUP BY "issuer", "account_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot migrate Better Auth accounts: duplicate issuer/account_id identity';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");
