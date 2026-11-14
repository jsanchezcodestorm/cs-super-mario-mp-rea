-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('REGISTER', 'LOGIN');

-- CreateEnum
CREATE TYPE "CampaignMode" AS ENUM ('SOLO', 'COOP');

-- CreateEnum
CREATE TYPE "CampaignRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "GameSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'INTERRUPTED', 'ABANDONED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "nickname" VARCHAR(24) NOT NULL,
    "nickname_key" VARCHAR(24) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_challenges" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" "ChallengePurpose" NOT NULL,
    "account_id" UUID,
    "pending_email" VARCHAR(320),
    "pending_nickname" VARCHAR(24),
    "pending_nickname_key" VARCHAR(24),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "account_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(48) NOT NULL,
    "mode" "CampaignMode" NOT NULL,
    "import_key" VARCHAR(128),
    "save_state" JSONB NOT NULL,
    "save_format_version" INTEGER NOT NULL DEFAULT 2,
    "content_version" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_members" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role" "CampaignRole" NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_invites" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "campaign_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "uses" INTEGER NOT NULL DEFAULT 0,
    "max_uses" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "mode" "CampaignMode" NOT NULL,
    "status" "GameSessionStatus" NOT NULL,
    "close_reason" VARCHAR(40),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_durable_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_session_participants" (
    "id" UUID NOT NULL,
    "game_session_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "character" VARCHAR(8) NOT NULL,
    "nickname_at_start" VARCHAR(24) NOT NULL,
    "initial_score" INTEGER NOT NULL DEFAULT 0,
    "last_credited_score" INTEGER NOT NULL DEFAULT 0,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "starting_exit_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completed_exit_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_exit_count" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_session_checkpoints" (
    "id" UUID NOT NULL,
    "game_session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "campaign_revision" INTEGER NOT NULL,
    "save_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_session_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_nickname_key_key" ON "accounts"("nickname_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_challenges_token_hash_key" ON "email_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "email_challenges_account_id_purpose_expires_at_idx" ON "email_challenges"("account_id", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "email_challenges_pending_email_purpose_expires_at_idx" ON "email_challenges"("pending_email", "purpose", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_account_id_expires_at_idx" ON "auth_sessions"("account_id", "expires_at");

-- CreateIndex
CREATE INDEX "campaigns_owner_id_updated_at_idx" ON "campaigns"("owner_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_owner_id_import_key_key" ON "campaigns"("owner_id", "import_key");

-- CreateIndex
CREATE INDEX "campaign_members_account_id_joined_at_idx" ON "campaign_members"("account_id", "joined_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_members_campaign_id_account_id_key" ON "campaign_members"("campaign_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_invites_token_hash_key" ON "campaign_invites"("token_hash");

-- CreateIndex
CREATE INDEX "campaign_invites_campaign_id_expires_at_revoked_at_idx" ON "campaign_invites"("campaign_id", "expires_at", "revoked_at");

-- CreateIndex
CREATE INDEX "game_sessions_campaign_id_started_at_idx" ON "game_sessions"("campaign_id", "started_at");

-- CreateIndex
CREATE INDEX "game_session_participants_account_id_game_session_id_idx" ON "game_session_participants"("account_id", "game_session_id");

-- CreateIndex
CREATE INDEX "game_session_participants_points_earned_idx" ON "game_session_participants"("points_earned");

-- CreateIndex
CREATE INDEX "game_session_participants_max_exit_count_idx" ON "game_session_participants"("max_exit_count");

-- CreateIndex
CREATE UNIQUE INDEX "game_session_participants_game_session_id_account_id_key" ON "game_session_participants"("game_session_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_session_checkpoints_game_session_id_sequence_key" ON "game_session_checkpoints"("game_session_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "game_session_checkpoints_game_session_id_campaign_revision_key" ON "game_session_checkpoints"("game_session_id", "campaign_revision");

-- AddForeignKey
ALTER TABLE "email_challenges" ADD CONSTRAINT "email_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_invites" ADD CONSTRAINT "campaign_invites_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_invites" ADD CONSTRAINT "campaign_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_participants" ADD CONSTRAINT "game_session_participants_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_participants" ADD CONSTRAINT "game_session_participants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_checkpoints" ADD CONSTRAINT "game_session_checkpoints_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "campaign_members_one_owner_per_campaign"
  ON "campaign_members" ("campaign_id")
  WHERE "role" = 'OWNER';

CREATE UNIQUE INDEX "game_sessions_one_active_per_campaign"
  ON "game_sessions" ("campaign_id")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "game_session_participants"
  ADD CONSTRAINT "game_session_participants_nonnegative_totals"
  CHECK ("initial_score" >= 0 AND "last_credited_score" >= 0 AND "points_earned" >= 0 AND "max_exit_count" BETWEEN 0 AND 96);

ALTER TABLE "campaign_invites"
  ADD CONSTRAINT "campaign_invites_usage_bounds"
  CHECK ("uses" >= 0 AND "max_uses" BETWEEN 1 AND 8 AND "uses" <= "max_uses");

ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_revision_and_save_version"
  CHECK ("revision" >= 1 AND "save_format_version" IN (1, 2));

ALTER TABLE "email_challenges"
  ADD CONSTRAINT "email_challenges_payload_matches_purpose"
  CHECK (
    ("purpose" = 'REGISTER' AND "account_id" IS NULL AND "pending_email" IS NOT NULL AND "pending_nickname" IS NOT NULL AND "pending_nickname_key" IS NOT NULL)
    OR
    ("purpose" = 'LOGIN' AND "account_id" IS NOT NULL AND "pending_email" IS NULL AND "pending_nickname" IS NULL AND "pending_nickname_key" IS NULL)
  );

CREATE FUNCTION "check_campaign_owner_member"() RETURNS trigger AS $$
BEGIN
  IF NEW."role" = 'OWNER' AND NOT EXISTS (
    SELECT 1 FROM "campaigns" c WHERE c."id" = NEW."campaign_id" AND c."owner_id" = NEW."account_id"
  ) THEN
    RAISE EXCEPTION 'campaign owner membership must match campaigns.owner_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "campaign_members_owner_matches_campaign"
  BEFORE INSERT OR UPDATE
  ON "campaign_members"
  FOR EACH ROW EXECUTE FUNCTION "check_campaign_owner_member"();
