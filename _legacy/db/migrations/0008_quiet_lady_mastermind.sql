CREATE TABLE "action_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"ref" text NOT NULL,
	"workflow_ref" text NOT NULL,
	"sha" text NOT NULL,
	"action_name" text NOT NULL,
	"context_type" text NOT NULL,
	"context_name" text,
	"context_path" text,
	"workflow" text NOT NULL,
	"workflow_run_id" bigint,
	"status" text NOT NULL,
	"conclusion" text,
	"html_url" text,
	"triggered_by" jsonb NOT NULL,
	"failure" jsonb,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "idx_action_run_owner_repo_createdAt" ON "action_run" USING btree ("owner","repo","created_at");--> statement-breakpoint
CREATE INDEX "idx_action_run_owner_repo_actionName" ON "action_run" USING btree ("owner","repo","action_name");--> statement-breakpoint
CREATE INDEX "idx_action_run_owner_repo_status" ON "action_run" USING btree ("owner","repo","status");--> statement-breakpoint
CREATE INDEX "idx_action_run_context" ON "action_run" USING btree ("owner","repo","context_type","context_name","context_path");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_action_run_workflowRunId" ON "action_run" USING btree ("workflow_run_id");