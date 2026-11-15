-- AlterTable
ALTER TABLE "inventory"."outbox_events"
  ADD COLUMN IF NOT EXISTS "claimed_by" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "claimed_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outbox_events_status_next_attempt_at_created_at_idx"
  ON "inventory"."outbox_events"("status", "next_attempt_at", "created_at");
