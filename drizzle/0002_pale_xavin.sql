ALTER TABLE "solutions" ADD COLUMN "snapshot_hash" text;--> statement-breakpoint
CREATE INDEX "solutions_canvas_snapshot_idx" ON "solutions" USING btree ("canvas_id","snapshot_hash");