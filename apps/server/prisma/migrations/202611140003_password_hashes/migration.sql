ALTER TABLE "accounts"
  ADD COLUMN "password_hash" VARCHAR(255);

ALTER TABLE "email_challenges"
  ADD COLUMN "pending_password_hash" VARCHAR(255);

ALTER TABLE "email_challenges"
  DROP CONSTRAINT "email_challenges_payload_matches_purpose";

ALTER TABLE "email_challenges"
  ADD CONSTRAINT "email_challenges_payload_matches_purpose"
  CHECK (
    (
      "purpose" = 'REGISTER'
      AND "account_id" IS NULL
      AND "pending_email" IS NOT NULL
      AND "pending_nickname" IS NOT NULL
      AND "pending_nickname_key" IS NOT NULL
    )
    OR
    (
      "purpose" = 'LOGIN'
      AND "account_id" IS NOT NULL
      AND "pending_email" IS NULL
      AND "pending_nickname" IS NULL
      AND "pending_nickname_key" IS NULL
      AND "pending_password_hash" IS NULL
    )
    OR
    (
      "purpose" = 'PASSWORD_RESET'
      AND "account_id" IS NOT NULL
      AND "pending_email" IS NULL
      AND "pending_nickname" IS NULL
      AND "pending_nickname_key" IS NULL
      AND "pending_password_hash" IS NULL
    )
  );
