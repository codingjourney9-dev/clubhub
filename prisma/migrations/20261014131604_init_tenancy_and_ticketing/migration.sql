-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClubRole" AS ENUM ('PRESIDENT', 'EVENT_MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('SCANNER', 'MANUAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "avatar_url" TEXT,
    "timezone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "branding_settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "logo_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_members" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ClubRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "club_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER,
    "waitlist_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "qr_code_uuid" UUID NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'REGISTERED',
    "waitlist_position" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "check_in_time" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "AttendanceSource" NOT NULL DEFAULT 'SCANNER',
    "checked_in_by" UUID,
    "scan_uuid" UUID,
    "device_label" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE INDEX "tenant_members_user_id_role_idx" ON "tenant_members"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_members_tenant_id_user_id_key" ON "tenant_members"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "clubs_tenant_id_deleted_at_idx" ON "clubs"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_id_tenant_id_key" ON "clubs"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_tenant_id_slug_key" ON "clubs"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "club_members_user_id_role_idx" ON "club_members"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "club_members_club_id_user_id_key" ON "club_members"("club_id", "user_id");

-- CreateIndex
CREATE INDEX "events_tenant_id_start_time_idx" ON "events"("tenant_id", "start_time");

-- CreateIndex
CREATE INDEX "events_club_id_status_deleted_at_idx" ON "events"("club_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "events_tenant_id_is_public_deleted_at_idx" ON "events"("tenant_id", "is_public", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "events_id_tenant_id_key" ON "events"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_qr_code_uuid_key" ON "tickets"("qr_code_uuid");

-- CreateIndex
CREATE INDEX "tickets_event_id_status_idx" ON "tickets"("event_id", "status");

-- CreateIndex
CREATE INDEX "tickets_user_id_created_at_idx" ON "tickets"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_event_id_user_id_key" ON "tickets"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_tenant_id_key" ON "tickets"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_ticket_id_key" ON "attendance"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_scan_uuid_key" ON "attendance"("scan_uuid");

-- CreateIndex
CREATE INDEX "attendance_event_id_check_in_time_idx" ON "attendance"("event_id", "check_in_time");

-- CreateIndex
CREATE INDEX "attendance_checked_in_by_idx" ON "attendance"("checked_in_by");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_ticket_id_tenant_id_key" ON "attendance"("ticket_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_members" ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_club_id_tenant_id_fkey" FOREIGN KEY ("club_id", "tenant_id") REFERENCES "clubs"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_tenant_id_fkey" FOREIGN KEY ("event_id", "tenant_id") REFERENCES "events"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_ticket_id_tenant_id_fkey" FOREIGN KEY ("ticket_id", "tenant_id") REFERENCES "tickets"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
