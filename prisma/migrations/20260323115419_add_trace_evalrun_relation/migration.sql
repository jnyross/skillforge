-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalRunId" TEXT,
    "skillVersionId" TEXT,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "totalDurationMs" INTEGER,
    "totalCostUsd" REAL,
    "totalTokens" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Trace_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Trace_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Trace" ("completedAt", "createdAt", "error", "evalRunId", "id", "inputTokens", "model", "outputTokens", "prompt", "resultJson", "sessionId", "skillVersionId", "status", "totalCostUsd", "totalDurationMs", "totalTokens") SELECT "completedAt", "createdAt", "error", "evalRunId", "id", "inputTokens", "model", "outputTokens", "prompt", "resultJson", "sessionId", "skillVersionId", "status", "totalCostUsd", "totalDurationMs", "totalTokens" FROM "Trace";
DROP TABLE "Trace";
ALTER TABLE "new_Trace" RENAME TO "Trace";
CREATE INDEX "Trace_evalRunId_idx" ON "Trace"("evalRunId");
CREATE INDEX "Trace_skillVersionId_idx" ON "Trace"("skillVersionId");
CREATE INDEX "Trace_status_idx" ON "Trace"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
