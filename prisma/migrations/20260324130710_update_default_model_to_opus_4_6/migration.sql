-- CreateTable
CREATE TABLE "EvalBuilderSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "phase" TEXT NOT NULL DEFAULT 'understanding',
    "status" TEXT NOT NULL DEFAULT 'active',
    "corpusText" TEXT NOT NULL DEFAULT '',
    "analysisJson" TEXT NOT NULL DEFAULT '{}',
    "proposedCasesJson" TEXT NOT NULL DEFAULT '[]',
    "committedSuiteIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EvalBuilderSession_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalBuilderMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalBuilderMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EvalBuilderSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillBranch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headVersionId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillBranch_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillBranch_headVersionId_fkey" FOREIGN KEY ("headVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EvalRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "baselineVersionId" TEXT,
    "suiteId" TEXT NOT NULL,
    "executorType" TEXT NOT NULL DEFAULT 'claude-cli',
    "claudeVersion" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-4-6',
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
INSERT INTO "new_EvalRun" ("baselineVersionId", "claudeVersion", "completedAt", "createdAt", "effort", "error", "executorType", "id", "jobId", "maxTurns", "metricsJson", "model", "permissionMode", "skillRepoId", "skillVersionId", "splitFilter", "startedAt", "status", "suiteId") SELECT "baselineVersionId", "claudeVersion", "completedAt", "createdAt", "effort", "error", "executorType", "id", "jobId", "maxTurns", "metricsJson", "model", "permissionMode", "skillRepoId", "skillVersionId", "splitFilter", "startedAt", "status", "suiteId" FROM "EvalRun";
DROP TABLE "EvalRun";
ALTER TABLE "new_EvalRun" RENAME TO "EvalRun";
CREATE INDEX "EvalRun_skillRepoId_idx" ON "EvalRun"("skillRepoId");
CREATE INDEX "EvalRun_skillVersionId_idx" ON "EvalRun"("skillVersionId");
CREATE INDEX "EvalRun_suiteId_idx" ON "EvalRun"("suiteId");
CREATE INDEX "EvalRun_status_idx" ON "EvalRun"("status");
CREATE TABLE "new_JudgeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "targetCriterion" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-4-6',
    "outputSchema" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "calibrationDatasetVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_JudgeDefinition" ("calibrationDatasetVersion", "createdAt", "id", "model", "name", "outputSchema", "purpose", "scope", "status", "targetCriterion", "updatedAt") SELECT "calibrationDatasetVersion", "createdAt", "id", "model", "name", "outputSchema", "purpose", "scope", "status", "targetCriterion", "updatedAt" FROM "JudgeDefinition";
DROP TABLE "JudgeDefinition";
ALTER TABLE "new_JudgeDefinition" RENAME TO "JudgeDefinition";
CREATE UNIQUE INDEX "JudgeDefinition_name_key" ON "JudgeDefinition"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EvalBuilderSession_status_idx" ON "EvalBuilderSession"("status");

-- CreateIndex
CREATE INDEX "EvalBuilderMessage_sessionId_idx" ON "EvalBuilderMessage"("sessionId");

-- CreateIndex
CREATE INDEX "EvalBuilderMessage_sessionId_createdAt_idx" ON "EvalBuilderMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_idx" ON "WorkspaceUser"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_userId_idx" ON "WorkspaceUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_userId_key" ON "WorkspaceUser"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "SkillBranch_skillRepoId_idx" ON "SkillBranch"("skillRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillBranch_skillRepoId_name_key" ON "SkillBranch"("skillRepoId", "name");
