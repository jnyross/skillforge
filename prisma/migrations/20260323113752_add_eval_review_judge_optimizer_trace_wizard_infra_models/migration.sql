-- AlterTable
ALTER TABLE "SkillVersion" ADD COLUMN "linterScore" REAL;

-- CreateTable
CREATE TABLE "EvalSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "splitPolicy" TEXT NOT NULL DEFAULT 'random',
    "version" INTEGER NOT NULL DEFAULT 1,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalSuite_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalCase" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalCase_evalSuiteId_fkey" FOREIGN KEY ("evalSuiteId") REFERENCES "EvalSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalCaseFixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalCaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalCaseFixture_evalCaseId_fkey" FOREIGN KEY ("evalCaseId") REFERENCES "EvalCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalRun" (
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

-- CreateTable
CREATE TABLE "EvalCaseRun" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalCaseRun_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_evalCaseId_fkey" FOREIGN KEY ("evalCaseId") REFERENCES "EvalCase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvalCaseRun_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssertionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalCaseRunId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expected" TEXT NOT NULL DEFAULT '',
    "actual" TEXT NOT NULL DEFAULT '',
    "passed" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssertionResult_evalCaseRunId_fkey" FOREIGN KEY ("evalCaseRunId") REFERENCES "EvalCaseRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "evalRunId" TEXT NOT NULL,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "failedCases" INTEGER NOT NULL DEFAULT 0,
    "errorCases" INTEGER NOT NULL DEFAULT 0,
    "skippedCases" INTEGER NOT NULL DEFAULT 0,
    "passRate" REAL NOT NULL DEFAULT 0,
    "avgDurationMs" REAL,
    "totalCostUsd" REAL,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkSnapshot_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkSnapshot_evalRunId_fkey" FOREIGN KEY ("evalRunId") REFERENCES "EvalRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalPairs" INTEGER NOT NULL DEFAULT 0,
    "completedPairs" INTEGER NOT NULL DEFAULT 0,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ReviewSession_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PairwiseComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewSessionId" TEXT NOT NULL,
    "evalCaseRunIdA" TEXT NOT NULL,
    "evalCaseRunIdB" TEXT NOT NULL,
    "versionIdA" TEXT NOT NULL,
    "versionIdB" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairwiseComparison_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PreferenceVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comparisonId" TEXT NOT NULL,
    "selectedWinner" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreferenceVote_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "PairwiseComparison" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewSessionId" TEXT NOT NULL,
    "evalCaseRunId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewLabel_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Critique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewLabelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'minor',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Critique_reviewLabelId_fkey" FOREIGN KEY ("reviewLabelId") REFERENCES "ReviewLabel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JudgeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "targetCriterion" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "outputSchema" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "calibrationDatasetVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JudgePromptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judgeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "systemPrompt" TEXT NOT NULL,
    "userPromptTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JudgePromptVersion_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "JudgeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JudgeCalibrationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judgeId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalExamples" INTEGER NOT NULL DEFAULT 0,
    "truePositives" INTEGER NOT NULL DEFAULT 0,
    "trueNegatives" INTEGER NOT NULL DEFAULT 0,
    "falsePositives" INTEGER NOT NULL DEFAULT 0,
    "falseNegatives" INTEGER NOT NULL DEFAULT 0,
    "precision" REAL,
    "recall" REAL,
    "agreementRate" REAL,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "JudgeCalibrationRun_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "JudgeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JudgeCalibrationRun_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "JudgePromptVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JudgeExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judgeId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expectedLabel" TEXT NOT NULL,
    "humanCritique" TEXT NOT NULL DEFAULT '',
    "split" TEXT NOT NULL DEFAULT 'train',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JudgeExample_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "JudgeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizerRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "baselineVersionId" TEXT NOT NULL,
    "suiteIds" TEXT NOT NULL DEFAULT '',
    "maxIterations" INTEGER NOT NULL DEFAULT 10,
    "maxBudgetUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentIteration" INTEGER NOT NULL DEFAULT 0,
    "objectiveJson" TEXT NOT NULL DEFAULT '{}',
    "promotionRules" TEXT NOT NULL DEFAULT '{}',
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "OptimizerRun_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizerCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optimizerRunId" TEXT NOT NULL,
    "parentVersionId" TEXT NOT NULL,
    "candidateVersionId" TEXT,
    "mutationType" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "patchDiff" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "objectiveJson" TEXT NOT NULL DEFAULT '{}',
    "runBudgetUsd" REAL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "OptimizerCandidate_optimizerRunId_fkey" FOREIGN KEY ("optimizerRunId") REFERENCES "OptimizerRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OptimizerCandidate_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "SkillVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OptimizerCandidate_candidateVersionId_fkey" FOREIGN KEY ("candidateVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizerMutation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT '',
    "beforeSnippet" TEXT NOT NULL DEFAULT '',
    "afterSnippet" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizerMutation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "OptimizerCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizerDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optimizerRunId" TEXT NOT NULL,
    "candidateId" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    "humanApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizerDecision_optimizerRunId_fkey" FOREIGN KEY ("optimizerRunId") REFERENCES "OptimizerRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trace" (
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
    CONSTRAINT "Trace_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ToolEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" TEXT NOT NULL DEFAULT '',
    "output" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToolEvent_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunArtifact_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LogChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "stream" TEXT NOT NULL DEFAULT 'stdout',
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogChunk_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WizardDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intent" TEXT NOT NULL DEFAULT '',
    "artifactsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'intake',
    "generatedSkill" TEXT NOT NULL DEFAULT '',
    "generatedEvals" TEXT NOT NULL DEFAULT '{}',
    "smokeResultJson" TEXT NOT NULL DEFAULT '{}',
    "savedVersionId" TEXT,
    "savedRepoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "result" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ExecutorConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastHealthCheck" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "actor" TEXT NOT NULL DEFAULT 'user',
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "EvalSuite_skillRepoId_idx" ON "EvalSuite"("skillRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalSuite_skillRepoId_name_key" ON "EvalSuite"("skillRepoId", "name");

-- CreateIndex
CREATE INDEX "EvalCase_evalSuiteId_idx" ON "EvalCase"("evalSuiteId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalCase_evalSuiteId_key_key" ON "EvalCase"("evalSuiteId", "key");

-- CreateIndex
CREATE INDEX "EvalCaseFixture_evalCaseId_idx" ON "EvalCaseFixture"("evalCaseId");

-- CreateIndex
CREATE INDEX "EvalRun_skillRepoId_idx" ON "EvalRun"("skillRepoId");

-- CreateIndex
CREATE INDEX "EvalRun_skillVersionId_idx" ON "EvalRun"("skillVersionId");

-- CreateIndex
CREATE INDEX "EvalRun_suiteId_idx" ON "EvalRun"("suiteId");

-- CreateIndex
CREATE INDEX "EvalRun_status_idx" ON "EvalRun"("status");

-- CreateIndex
CREATE INDEX "EvalCaseRun_evalRunId_idx" ON "EvalCaseRun"("evalRunId");

-- CreateIndex
CREATE INDEX "EvalCaseRun_evalCaseId_idx" ON "EvalCaseRun"("evalCaseId");

-- CreateIndex
CREATE INDEX "EvalCaseRun_status_idx" ON "EvalCaseRun"("status");

-- CreateIndex
CREATE INDEX "AssertionResult_evalCaseRunId_idx" ON "AssertionResult"("evalCaseRunId");

-- CreateIndex
CREATE INDEX "BenchmarkSnapshot_skillRepoId_idx" ON "BenchmarkSnapshot"("skillRepoId");

-- CreateIndex
CREATE INDEX "BenchmarkSnapshot_evalRunId_idx" ON "BenchmarkSnapshot"("evalRunId");

-- CreateIndex
CREATE INDEX "ReviewSession_skillRepoId_idx" ON "ReviewSession"("skillRepoId");

-- CreateIndex
CREATE INDEX "ReviewSession_status_idx" ON "ReviewSession"("status");

-- CreateIndex
CREATE INDEX "PairwiseComparison_reviewSessionId_idx" ON "PairwiseComparison"("reviewSessionId");

-- CreateIndex
CREATE INDEX "PreferenceVote_comparisonId_idx" ON "PreferenceVote"("comparisonId");

-- CreateIndex
CREATE INDEX "ReviewLabel_reviewSessionId_idx" ON "ReviewLabel"("reviewSessionId");

-- CreateIndex
CREATE INDEX "ReviewLabel_evalCaseRunId_idx" ON "ReviewLabel"("evalCaseRunId");

-- CreateIndex
CREATE INDEX "Critique_reviewLabelId_idx" ON "Critique"("reviewLabelId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeDefinition_name_key" ON "JudgeDefinition"("name");

-- CreateIndex
CREATE INDEX "JudgePromptVersion_judgeId_idx" ON "JudgePromptVersion"("judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgePromptVersion_judgeId_version_key" ON "JudgePromptVersion"("judgeId", "version");

-- CreateIndex
CREATE INDEX "JudgeCalibrationRun_judgeId_idx" ON "JudgeCalibrationRun"("judgeId");

-- CreateIndex
CREATE INDEX "JudgeCalibrationRun_promptVersionId_idx" ON "JudgeCalibrationRun"("promptVersionId");

-- CreateIndex
CREATE INDEX "JudgeExample_judgeId_idx" ON "JudgeExample"("judgeId");

-- CreateIndex
CREATE INDEX "JudgeExample_split_idx" ON "JudgeExample"("split");

-- CreateIndex
CREATE INDEX "OptimizerRun_skillRepoId_idx" ON "OptimizerRun"("skillRepoId");

-- CreateIndex
CREATE INDEX "OptimizerRun_status_idx" ON "OptimizerRun"("status");

-- CreateIndex
CREATE INDEX "OptimizerCandidate_optimizerRunId_idx" ON "OptimizerCandidate"("optimizerRunId");

-- CreateIndex
CREATE INDEX "OptimizerCandidate_status_idx" ON "OptimizerCandidate"("status");

-- CreateIndex
CREATE INDEX "OptimizerMutation_candidateId_idx" ON "OptimizerMutation"("candidateId");

-- CreateIndex
CREATE INDEX "OptimizerDecision_optimizerRunId_idx" ON "OptimizerDecision"("optimizerRunId");

-- CreateIndex
CREATE INDEX "Trace_evalRunId_idx" ON "Trace"("evalRunId");

-- CreateIndex
CREATE INDEX "Trace_skillVersionId_idx" ON "Trace"("skillVersionId");

-- CreateIndex
CREATE INDEX "Trace_status_idx" ON "Trace"("status");

-- CreateIndex
CREATE INDEX "ToolEvent_traceId_idx" ON "ToolEvent"("traceId");

-- CreateIndex
CREATE INDEX "ToolEvent_traceId_sequence_idx" ON "ToolEvent"("traceId", "sequence");

-- CreateIndex
CREATE INDEX "RunArtifact_traceId_idx" ON "RunArtifact"("traceId");

-- CreateIndex
CREATE INDEX "LogChunk_traceId_idx" ON "LogChunk"("traceId");

-- CreateIndex
CREATE INDEX "LogChunk_traceId_sequence_idx" ON "LogChunk"("traceId", "sequence");

-- CreateIndex
CREATE INDEX "JobRecord_type_status_idx" ON "JobRecord"("type", "status");

-- CreateIndex
CREATE INDEX "JobRecord_status_idx" ON "JobRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutorConfig_name_key" ON "ExecutorConfig"("name");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
