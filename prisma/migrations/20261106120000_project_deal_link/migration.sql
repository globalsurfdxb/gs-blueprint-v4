-- Deal Link: the CRM deal URL for a project. Additive and nullable so every existing project keeps working;
-- the create form and server action require it for new projects, and only Admins can see it.

ALTER TABLE "projects" ADD COLUMN "deal_link" TEXT;
