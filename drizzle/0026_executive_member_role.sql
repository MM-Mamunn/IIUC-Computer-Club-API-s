INSERT INTO "role" ("role", "priority", "description")
VALUES ('executive member', 7, 'Executive member (lowest privilege)')
ON CONFLICT ("role") DO UPDATE SET
  "priority" = EXCLUDED."priority",
  "description" = EXCLUDED."description";
