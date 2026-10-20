-- CreateEnum
CREATE TYPE "EventTag" AS ENUM ('TECHNICAL', 'CULTURAL', 'WORKSHOP', 'SPORTS', 'COMPETITION', 'TALK', 'MUSIC', 'ARTS', 'SOCIAL', 'CAREER');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "poster_url" TEXT,
ADD COLUMN     "tags" "EventTag"[] DEFAULT ARRAY[]::"EventTag"[],
ADD COLUMN     "whatsapp_url" TEXT;

-- CreateIndex
CREATE INDEX "events_tags_idx" ON "events" USING GIN ("tags");

-- Belt and braces: the API allows at most 3 tags; the database agrees, so no
-- script or future endpoint can write a fourth.
ALTER TABLE "events" ADD CONSTRAINT "events_tags_max_3" CHECK (cardinality("tags") <= 3);
