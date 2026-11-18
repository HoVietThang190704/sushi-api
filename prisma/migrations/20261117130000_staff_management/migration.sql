-- AlterTable
ALTER TABLE "identity"."users"
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_branch_id_role_idx"
  ON "identity"."users"("branch_id", "role");

-- CreateTable
CREATE TABLE IF NOT EXISTS "identity"."audit_logs" (
  "id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "action" VARCHAR(60) NOT NULL,
  "target_user_id" UUID,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_target_user_id_created_at_idx"
  ON "identity"."audit_logs"("target_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_created_at_idx"
  ON "identity"."audit_logs"("actor_id", "created_at");
