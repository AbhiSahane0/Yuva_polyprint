-- Designs whose roll weight the customer settles rather than the works.
--
-- Was a list of job names on a tab of the works' job card workbook, which the
-- slitter had to know to go and read. As a flag it reaches the job card itself.
ALTER TABLE "jobs"
    ADD COLUMN "confirm_roll_weight" BOOLEAN NOT NULL DEFAULT false;
