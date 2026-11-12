-- QA tester flag: who, besides the group Lead and Admin, may close or reopen a bug at Ready for Retest.
-- Additive, defaults to false for everyone, so no one gains or loses anything until an Admin ticks it.

ALTER TABLE "users" ADD COLUMN "is_qa" BOOLEAN NOT NULL DEFAULT false;
