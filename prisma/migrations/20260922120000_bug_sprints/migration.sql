-- Bug sprints: a named batch of a project's bugs with a due date (e.g. Frontend, Backend, Regression
-- Retesting). Additive - nothing existing changes; a bug with no bug sprint behaves exactly as before.

CREATE TABLE "bug_sprints" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bug_sprints_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bug_sprints_project_id_name_key" ON "bug_sprints"("project_id", "name");
CREATE INDEX "bug_sprints_project_id_idx" ON "bug_sprints"("project_id");

ALTER TABLE "bug_sprints"
  ADD CONSTRAINT "bug_sprints_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bug_sprints"
  ADD CONSTRAINT "bug_sprints_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD COLUMN "bug_sprint_id" TEXT;
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_bug_sprint_id_fkey"
  FOREIGN KEY ("bug_sprint_id") REFERENCES "bug_sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;
