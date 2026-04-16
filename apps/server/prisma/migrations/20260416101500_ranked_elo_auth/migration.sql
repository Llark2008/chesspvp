-- AlterTable
ALTER TABLE "matches"
ADD COLUMN "is_ranked" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "rankings_season_id_rating_wins_updated_at_idx"
ON "rankings"("season_id", "rating" DESC, "wins" DESC, "updated_at" ASC);
