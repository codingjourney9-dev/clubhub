-- CreateEnum
CREATE TYPE "ClubStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable
ALTER TABLE "clubs" ADD COLUMN     "faculty_email" TEXT,
ADD COLUMN     "faculty_name" TEXT,
ADD COLUMN     "status" "ClubStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "club_verifications" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "demo_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_sent_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "club_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "club_verifications_club_id_key" ON "club_verifications"("club_id");

-- CreateIndex
CREATE INDEX "club_verifications_tenant_id_idx" ON "club_verifications"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "club_verifications_club_id_tenant_id_key" ON "club_verifications"("club_id", "tenant_id");

-- CreateIndex
CREATE INDEX "clubs_tenant_id_status_idx" ON "clubs"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "club_verifications" ADD CONSTRAINT "club_verifications_club_id_tenant_id_fkey" FOREIGN KEY ("club_id", "tenant_id") REFERENCES "clubs"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: a PENDING club is waiting for a professor, so it must say which
-- one. (Prisma cannot express CHECK constraints; it leaves this one alone.)
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_pending_needs_faculty_email"
  CHECK ("status" <> 'PENDING' OR "faculty_email" IS NOT NULL);
