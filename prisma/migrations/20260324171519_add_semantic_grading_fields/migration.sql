-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssertionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalCaseRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expected" TEXT NOT NULL DEFAULT '',
    "actual" TEXT NOT NULL DEFAULT '',
    "passed" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "evidence" TEXT NOT NULL DEFAULT '',
    "reasoning" TEXT NOT NULL DEFAULT '',
    "confidence" REAL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "claimsJson" TEXT NOT NULL DEFAULT '[]',
    "evalFeedbackJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssertionResult_evalCaseRunId_fkey" FOREIGN KEY ("evalCaseRunId") REFERENCES "EvalCaseRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssertionResult" ("actual", "createdAt", "durationMs", "evalCaseRunId", "expected", "id", "message", "name", "passed", "type") SELECT "actual", "createdAt", "durationMs", "evalCaseRunId", "expected", "id", "message", "name", "passed", "type" FROM "AssertionResult";
DROP TABLE "AssertionResult";
ALTER TABLE "new_AssertionResult" RENAME TO "AssertionResult";
CREATE INDEX "AssertionResult_evalCaseRunId_idx" ON "AssertionResult"("evalCaseRunId");
CREATE TABLE "new_EvalCaseRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalRunId" TEXT NOT NULL,
    "evalCaseId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "durationMs" INTEGER,
    "costUsd" REAL,
    "tokenUsage" TEXT NOT NULL DEFAULT '{}',
    "triggerResult" BOOLEAN,
    "outputJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "traceId" TEXT,
    "evalFeedbackJson" TEXT NOT NULL DEFAULT '{}',
    "allClaimsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalCaseRun_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_evalCaseId_fkey" FOREIGN KEY ("evalCaseId") REFERENCES "EvalCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvalCaseRun" ("attempt", "costUsd", "createdAt", "durationMs", "error", "evalCaseId", "evalRunId", "id", "outputJson", "skillVersionId", "status", "tokenUsage", "traceId", "triggerResult") SELECT "attempt", "costUsd", "createdAt", "durationMs", "error", "evalCaseId", "evalRunId", "id", "outputJson", "skillVersionId", "status", "tokenUsage", "traceId", "triggerResult" FROM "EvalCaseRun";
DROP TABLE "EvalCaseRun";
ALTER TABLE "new_EvalCaseRun" RENAME TO "EvalCaseRun";
CREATE INDEX "EvalCaseRun_evalRunId_idx" ON "EvalCaseRun"("evalRunId");
CREATE INDEX "EvalCaseRun_evalCaseId_idx" ON "EvalCaseRun"("evalCaseId");
CREATE INDEX "EvalCaseRun_status_idx" ON "EvalCaseRun"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
