-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WizardDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intent" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'scratch',
    "artifactsJson" TEXT NOT NULL DEFAULT '[]',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'intake',
    "generatedSkill" TEXT NOT NULL DEFAULT '',
    "generatedEvals" TEXT NOT NULL DEFAULT '{}',
    "smokeResultJson" TEXT NOT NULL DEFAULT '{}',
    "savedVersionId" TEXT,
    "savedRepoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WizardDraft" ("artifactsJson", "createdAt", "generatedEvals", "generatedSkill", "id", "intent", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt") SELECT "artifactsJson", "createdAt", "generatedEvals", "generatedSkill", "id", "intent", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt" FROM "WizardDraft";
DROP TABLE "WizardDraft";
ALTER TABLE "new_WizardDraft" RENAME TO "WizardDraft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
