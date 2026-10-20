-- CreateEnum
CREATE TYPE "OpeningStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "role_openings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "role" "ClubRole" NOT NULL DEFAULT 'MEMBER',
    "questions" TEXT[],
    "status" "OpeningStatus" NOT NULL DEFAULT 'OPEN',
    "closes_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "role_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_applications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "opening_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opening_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_openings_status_deleted_at_created_at_idx" ON "role_openings"("status", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "role_openings_club_id_deleted_at_idx" ON "role_openings"("club_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "role_openings_id_tenant_id_key" ON "role_openings"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "opening_applications_applicant_id_created_at_idx" ON "opening_applications"("applicant_id", "created_at");

-- CreateIndex
CREATE INDEX "opening_applications_opening_id_status_idx" ON "opening_applications"("opening_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "opening_applications_opening_id_applicant_id_key" ON "opening_applications"("opening_id", "applicant_id");

-- AddForeignKey
ALTER TABLE "role_openings" ADD CONSTRAINT "role_openings_club_id_tenant_id_fkey" FOREIGN KEY ("club_id", "tenant_id") REFERENCES "clubs"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_openings" ADD CONSTRAINT "role_openings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_applications" ADD CONSTRAINT "opening_applications_opening_id_tenant_id_fkey" FOREIGN KEY ("opening_id", "tenant_id") REFERENCES "role_openings"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_applications" ADD CONSTRAINT "opening_applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_applications" ADD CONSTRAINT "opening_applications_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hand-written: rules Prisma's schema language can't express ─────────────

-- An opening can never make a President (presidency only moves by hand-over).
ALTER TABLE "role_openings"
  ADD CONSTRAINT "role_openings_role_not_president" CHECK ("role" IN ('MEMBER', 'EVENT_MANAGER')),
  ADD CONSTRAINT "role_openings_question_count" CHECK (cardinality("questions") BETWEEN 1 AND 3),
  ADD CONSTRAINT "role_openings_title_length" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "role_openings_description_length" CHECK (char_length(btrim("description")) BETWEEN 1 AND 4000),
  ADD CONSTRAINT "role_openings_requirements_length" CHECK ("requirements" IS NULL OR char_length("requirements") <= 2000);

-- Answers are a JSON list, and a decision always records who and when.
ALTER TABLE "opening_applications"
  ADD CONSTRAINT "opening_applications_answers_is_list" CHECK (jsonb_typeof("answers") = 'array'),
  ADD CONSTRAINT "opening_applications_decision_recorded" CHECK (
    ("status" IN ('ACCEPTED', 'REJECTED')) = ("decided_at" IS NOT NULL)
  );
