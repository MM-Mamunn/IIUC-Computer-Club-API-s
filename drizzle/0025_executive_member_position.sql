INSERT INTO "position" ("position", "description")
VALUES ('executive member', 'Executive member of the club')
ON CONFLICT ("position") DO NOTHING;
