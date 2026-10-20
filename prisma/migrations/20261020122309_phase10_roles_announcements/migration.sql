-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "pinned_at" TIMESTAMPTZ(3),
    "edited_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_club_id_deleted_at_created_at_idx" ON "announcements"("club_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "announcements_tenant_id_idx" ON "announcements"("tenant_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_club_id_tenant_id_fkey" FOREIGN KEY ("club_id", "tenant_id") REFERENCES "clubs"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written: rules Prisma's schema language can't express ─────────────

-- 1. Exactly one President per club.
--    Existing data first: a club that already has several Presidents keeps the
--    longest-serving one; the others become Leads (EVENT_MANAGER), so nobody
--    loses the ability to run events.
UPDATE "club_members" AS cm
SET "role" = 'EVENT_MANAGER', "updated_at" = CURRENT_TIMESTAMP
WHERE cm."role" = 'PRESIDENT'
  AND cm."deleted_at" IS NULL
  AND cm."id" <> (
    SELECT p."id" FROM "club_members" AS p
    WHERE p."club_id" = cm."club_id" AND p."role" = 'PRESIDENT' AND p."deleted_at" IS NULL
    ORDER BY p."joined_at", p."created_at", p."id"
    LIMIT 1
  );

--    Invite links can no longer make Presidents. Unused ones become Lead links.
UPDATE "club_invites" SET "role" = 'EVENT_MANAGER' WHERE "role" = 'PRESIDENT';

CREATE UNIQUE INDEX "club_members_one_president"
  ON "club_members" ("club_id")
  WHERE "role" = 'PRESIDENT' AND "deleted_at" IS NULL;

-- 2. At most one pinned announcement per club.
CREATE UNIQUE INDEX "announcements_one_pinned"
  ON "announcements" ("club_id")
  WHERE "pinned_at" IS NOT NULL AND "deleted_at" IS NULL;

-- 3. Length limits, matching src/lib/validation/announcement.ts.
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_title_length" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "announcements_body_length" CHECK (char_length(btrim("body")) BETWEEN 1 AND 4000);
