-- CreateTable
CREATE TABLE "BlindComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalCaseRunId" TEXT NOT NULL,
    "evalRunId" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "skillIsA" BOOLEAN NOT NULL,
    "delta" REAL NOT NULL DEFAULT 0,
    "reasoningText" TEXT NOT NULL DEFAULT '',
    "rubricJson" TEXT NOT NULL DEFAULT '{}',
    "outputQualityJson" TEXT NOT NULL DEFAULT '{}',
    "expectationResultsJson" TEXT NOT NULL DEFAULT '{}',
    "skillScore" REAL NOT NULL DEFAULT 0,
    "baselineScore" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlindComparison_evalCaseRunId_fkey" FOREIGN KEY ("evalCaseRunId") REFERENCES "EvalCaseRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlindComparison_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TriggerOptimizationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentIteration" INTEGER NOT NULL DEFAULT 0,
    "maxIterations" INTEGER NOT NULL DEFAULT 5,
    "originalDescription" TEXT NOT NULL DEFAULT '',
    "bestDescription" TEXT NOT NULL DEFAULT '',
    "bestTestScore" REAL NOT NULL DEFAULT 0,
    "bestTrainScore" REAL NOT NULL DEFAULT 0,
    "queriesJson" TEXT NOT NULL DEFAULT '[]',
    "trainIndices" TEXT NOT NULL DEFAULT '[]',
    "testIndices" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "TriggerOptimizationRun_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TriggerOptimizationIteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "trainScore" REAL NOT NULL DEFAULT 0,
    "testScore" REAL NOT NULL DEFAULT 0,
    "trainResultsJson" TEXT NOT NULL DEFAULT '[]',
    "testResultsJson" TEXT NOT NULL DEFAULT '[]',
    "improvementReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TriggerOptimizationIteration_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TriggerOptimizationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImprovementIteration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "resultVersionId" TEXT,
    "iterationNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evalRunId" TEXT,
    "passRate" REAL,
    "comparisonRunId" TEXT,
    "skillWinRate" REAL,
    "avgDelta" REAL,
    "analysisJson" TEXT NOT NULL DEFAULT '{}',
    "suggestionsJson" TEXT NOT NULL DEFAULT '[]',
    "acceptedIndices" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ImprovementIteration_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImprovementIteration_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImprovementIteration_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "baselineOutputJson" TEXT NOT NULL DEFAULT '{}',
    "feedbackJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalCaseRun_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_evalCaseId_fkey" FOREIGN KEY ("evalCaseId") REFERENCES "EvalCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvalCaseRun" ("allClaimsJson", "attempt", "costUsd", "createdAt", "durationMs", "error", "evalCaseId", "evalFeedbackJson", "evalRunId", "id", "outputJson", "skillVersionId", "status", "tokenUsage", "traceId", "triggerResult") SELECT "allClaimsJson", "attempt", "costUsd", "createdAt", "durationMs", "error", "evalCaseId", "evalFeedbackJson", "evalRunId", "id", "outputJson", "skillVersionId", "status", "tokenUsage", "traceId", "triggerResult" FROM "EvalCaseRun";
DROP TABLE "EvalCaseRun";
ALTER TABLE "new_EvalCaseRun" RENAME TO "EvalCaseRun";
CREATE INDEX "EvalCaseRun_evalRunId_idx" ON "EvalCaseRun"("evalRunId");
CREATE INDEX "EvalCaseRun_evalCaseId_idx" ON "EvalCaseRun"("evalCaseId");
CREATE INDEX "EvalCaseRun_status_idx" ON "EvalCaseRun"("status");
CREATE TABLE "new_WizardDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intent" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'scratch',
    "artifactsJson" TEXT NOT NULL DEFAULT '[]',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "concreteExamples" TEXT NOT NULL DEFAULT '[]',
    "freedomLevel" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'intake',
    "generatedSkill" TEXT NOT NULL DEFAULT '',
    "generatedEvals" TEXT NOT NULL DEFAULT '{}',
    "smokeResultJson" TEXT NOT NULL DEFAULT '{}',
    "savedVersionId" TEXT,
    "savedRepoId" TEXT,
    "interviewContextJson" TEXT NOT NULL DEFAULT '',
    "interviewTranscript" TEXT NOT NULL DEFAULT '',
    "extractedAnswersJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WizardDraft" ("artifactsJson", "concreteExamples", "configJson", "createdAt", "freedomLevel", "generatedEvals", "generatedSkill", "id", "intent", "mode", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt") SELECT "artifactsJson", "concreteExamples", "configJson", "createdAt", "freedomLevel", "generatedEvals", "generatedSkill", "id", "intent", "mode", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt" FROM "WizardDraft";
DROP TABLE "WizardDraft";
ALTER TABLE "new_WizardDraft" RENAME TO "WizardDraft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BlindComparison_evalCaseRunId_idx" ON "BlindComparison"("evalCaseRunId");

-- CreateIndex
CREATE INDEX "BlindComparison_evalRunId_idx" ON "BlindComparison"("evalRunId");

-- CreateIndex
CREATE INDEX "TriggerOptimizationRun_skillRepoId_idx" ON "TriggerOptimizationRun"("skillRepoId");

-- CreateIndex
CREATE INDEX "TriggerOptimizationRun_status_idx" ON "TriggerOptimizationRun"("status");

-- CreateIndex
CREATE INDEX "TriggerOptimizationIteration_runId_idx" ON "TriggerOptimizationIteration"("runId");

-- CreateIndex
CREATE INDEX "TriggerOptimizationIteration_runId_iteration_idx" ON "TriggerOptimizationIteration"("runId", "iteration");

-- CreateIndex
CREATE INDEX "ImprovementIteration_skillRepoId_idx" ON "ImprovementIteration"("skillRepoId");

-- CreateIndex
CREATE INDEX "ImprovementIteration_sourceVersionId_idx" ON "ImprovementIteration"("sourceVersionId");

-- CreateIndex
CREATE INDEX "ImprovementIteration_status_idx" ON "ImprovementIteration"("status");
