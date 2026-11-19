-- Urgent tasks raised from the Content Calendar (e.g. by the Social Media Cluster Head): flagged so the calendar can
-- tag them. Additive, defaults to false for every existing task.

ALTER TABLE "tasks" ADD COLUMN "is_urgent" BOOLEAN NOT NULL DEFAULT false;
