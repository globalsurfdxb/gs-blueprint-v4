-- Project pages: the pages (name + URL) of a project's site, and which page a bug was found on. Additive - a new
-- table and one nullable column; existing tasks are untouched.

CREATE TABLE "project_pages" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_pages_project_id_name_key" ON "project_pages"("project_id", "name");
CREATE INDEX "project_pages_project_id_idx" ON "project_pages"("project_id");

ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_pages" ADD CONSTRAINT "project_pages_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD COLUMN "page_id" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_page_id_fkey"
  FOREIGN KEY ("page_id") REFERENCES "project_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_page_id_idx" ON "tasks"("page_id");
