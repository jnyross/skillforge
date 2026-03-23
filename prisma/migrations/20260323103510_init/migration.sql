-- CreateTable
CREATE TABLE "SkillRepo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "currentChampionVersionId" TEXT,
    "gitRepoPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillRepo_currentChampionVersionId_fkey" FOREIGN KEY ("currentChampionVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL DEFAULT 'main',
    "gitCommitSha" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "commitMessage" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "isChampion" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SkillVersion_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SkillVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "SkillVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VersionTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VersionTag_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GitImportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "skillVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "GitImportLog_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LintResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillRepoId" TEXT NOT NULL,
    "skillVersionId" TEXT,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "file" TEXT NOT NULL DEFAULT 'SKILL.md',
    "line" INTEGER,
    "evidence" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LintResult_skillRepoId_fkey" FOREIGN KEY ("skillRepoId") REFERENCES "SkillRepo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LintResult_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillRepo_slug_key" ON "SkillRepo"("slug");

-- CreateIndex
CREATE INDEX "SkillVersion_skillRepoId_createdAt_idx" ON "SkillVersion"("skillRepoId", "createdAt");

-- CreateIndex
CREATE INDEX "SkillVersion_skillRepoId_branchName_createdAt_idx" ON "SkillVersion"("skillRepoId", "branchName", "createdAt");

-- CreateIndex
CREATE INDEX "VersionTag_skillVersionId_idx" ON "VersionTag"("skillVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "VersionTag_skillVersionId_name_key" ON "VersionTag"("skillVersionId", "name");

-- CreateIndex
CREATE INDEX "GitImportLog_skillRepoId_idx" ON "GitImportLog"("skillRepoId");

-- CreateIndex
CREATE INDEX "LintResult_skillRepoId_idx" ON "LintResult"("skillRepoId");

-- CreateIndex
CREATE INDEX "LintResult_skillVersionId_idx" ON "LintResult"("skillVersionId");
