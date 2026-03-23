-- CreateTable
CREATE TABLE "ErrorAnalysisSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "samplingStrategy" TEXT NOT NULL DEFAULT 'random',
    "targetTraceCount" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ErrorAnalysisSession_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ErrorAnalysisTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisSessionId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "openCodingNotes" TEXT NOT NULL DEFAULT '',
    "failureCategoryId" TEXT,
    "isNewFailureMode" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErrorAnalysisTrace_analysisSessionId_fkey" FOREIGN KEY ("analysisSessionId") REFERENCES "ErrorAnalysisSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorAnalysisTrace_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ErrorAnalysisTrace_failureCategoryId_fkey" FOREIGN KEY ("failureCategoryId") REFERENCES "FailureCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FailureCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisSessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'major',
    "exampleTraceIds" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FailureCategory_analysisSessionId_fkey" FOREIGN KEY ("analysisSessionId") REFERENCES "ErrorAnalysisSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyntheticDataConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalSuiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyntheticDataConfig_evalSuiteId_fkey" FOREIGN KEY ("evalSuiteId") REFERENCES "EvalSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyntheticDimension" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "values" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyntheticDimension_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SyntheticDataConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyntheticTuple" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "dimensionValues" TEXT NOT NULL,
    "naturalLanguage" TEXT NOT NULL DEFAULT '',
    "expectedOutcome" TEXT NOT NULL DEFAULT '',
    "included" BOOLEAN NOT NULL DEFAULT true,
    "evalCaseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyntheticTuple_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SyntheticDataConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvalCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalSuiteId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "shouldTrigger" BOOLEAN,
    "expectedOutcome" TEXT NOT NULL DEFAULT '',
    "split" TEXT NOT NULL DEFAULT 'train',
    "tags" TEXT NOT NULL DEFAULT '',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "judgeId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalCase_evalSuiteId_fkey" FOREIGN KEY ("evalSuiteId") REFERENCES "EvalSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvalCase_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "JudgeDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvalCase" ("configJson", "createdAt", "evalSuiteId", "expectedOutcome", "id", "key", "name", "prompt", "shouldTrigger", "split", "tags", "updatedAt") SELECT "configJson", "createdAt", "evalSuiteId", "expectedOutcome", "id", "key", "name", "prompt", "shouldTrigger", "split", "tags", "updatedAt" FROM "EvalCase";
DROP TABLE "EvalCase";
ALTER TABLE "new_EvalCase" RENAME TO "EvalCase";
CREATE INDEX "EvalCase_evalSuiteId_idx" ON "EvalCase"("evalSuiteId");
CREATE UNIQUE INDEX "EvalCase_evalSuiteId_key_key" ON "EvalCase"("evalSuiteId", "key");
CREATE TABLE "new_EvalRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "baselineVersionId" TEXT,
    "suiteId" TEXT NOT NULL,
    "executorType" TEXT NOT NULL DEFAULT 'claude-cli',
    "claudeVersion" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "effort" TEXT NOT NULL DEFAULT 'medium',
    "permissionMode" TEXT NOT NULL DEFAULT 'default',
    "maxTurns" INTEGER NOT NULL DEFAULT 10,
    "splitFilter" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalRun_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvalRun_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalRun_baselineVersionId_fkey" FOREIGN KEY ("baselineVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EvalRun_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvalSuite" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EvalRun" ("baselineVersionId", "claudeVersion", "completedAt", "createdAt", "effort", "error", "executorType", "id", "jobId", "maxTurns", "metricsJson", "model", "permissionMode", "skillRepoId", "skillVersionId", "startedAt", "status", "suiteId") SELECT "baselineVersionId", "claudeVersion", "completedAt", "createdAt", "effort", "error", "executorType", "id", "jobId", "maxTurns", "metricsJson", "model", "permissionMode", "skillRepoId", "skillVersionId", "startedAt", "status", "suiteId" FROM "EvalRun";
DROP TABLE "EvalRun";
ALTER TABLE "new_EvalRun" RENAME TO "EvalRun";
CREATE INDEX "EvalRun_skillRepoId_idx" ON "EvalRun"("skillRepoId");
CREATE INDEX "EvalRun_skillVersionId_idx" ON "EvalRun"("skillVersionId");
CREATE INDEX "EvalRun_suiteId_idx" ON "EvalRun"("suiteId");
CREATE INDEX "EvalRun_status_idx" ON "EvalRun"("status");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_WizardDraft" ("artifactsJson", "configJson", "createdAt", "generatedEvals", "generatedSkill", "id", "intent", "mode", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt") SELECT "artifactsJson", "configJson", "createdAt", "generatedEvals", "generatedSkill", "id", "intent", "mode", "savedRepoId", "savedVersionId", "smokeResultJson", "status", "updatedAt" FROM "WizardDraft";
DROP TABLE "WizardDraft";
ALTER TABLE "new_WizardDraft" RENAME TO "WizardDraft";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ErrorAnalysisSession_skillRepoId_idx" ON "ErrorAnalysisSession"("skillRepoId");

-- CreateIndex
CREATE INDEX "ErrorAnalysisTrace_analysisSessionId_idx" ON "ErrorAnalysisTrace"("analysisSessionId");

-- CreateIndex
CREATE INDEX "ErrorAnalysisTrace_traceId_idx" ON "ErrorAnalysisTrace"("traceId");

-- CreateIndex
CREATE INDEX "FailureCategory_analysisSessionId_idx" ON "FailureCategory"("analysisSessionId");

-- CreateIndex
CREATE INDEX "SyntheticDataConfig_evalSuiteId_idx" ON "SyntheticDataConfig"("evalSuiteId");

-- CreateIndex
CREATE INDEX "SyntheticDimension_configId_idx" ON "SyntheticDimension"("configId");

-- CreateIndex
CREATE INDEX "SyntheticTuple_configId_idx" ON "SyntheticTuple"("configId");
