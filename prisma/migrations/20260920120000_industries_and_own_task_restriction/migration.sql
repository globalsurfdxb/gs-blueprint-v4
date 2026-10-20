-- Admin-managed Industry options for the Client form, plus a per-user "only see my own tasks"
-- switch. Both additive: no existing column or row is changed.

CREATE TABLE "industries" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "industries_name_key" ON "industries"("name");

-- Seed the list from the industries already typed on existing clients, so every current client's
-- value is a valid dropdown choice from day one (trimmed, case-insensitive de-duplication).
INSERT INTO "industries" ("id", "name")
SELECT 'ind_' || md5(lower(trim("industry"))), min(trim("industry"))
FROM "clients"
WHERE "industry" IS NOT NULL AND trim("industry") <> ''
GROUP BY lower(trim("industry"));

ALTER TABLE "users" ADD COLUMN "restrict_to_own_tasks" BOOLEAN NOT NULL DEFAULT false;
