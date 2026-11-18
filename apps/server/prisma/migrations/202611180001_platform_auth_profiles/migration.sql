DROP TABLE "email_challenges";
DROP TABLE "auth_sessions";
ALTER TABLE "accounts" DROP COLUMN "email";
ALTER TABLE "accounts" DROP COLUMN "email_verified_at";
ALTER TABLE "accounts" DROP COLUMN "password_hash";
DROP TYPE "ChallengePurpose";
