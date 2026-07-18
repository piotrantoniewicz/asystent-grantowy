-- CreateTable
CREATE TABLE "SavedSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedSource_userId_lastUsedAt_idx" ON "SavedSource"("userId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedSource_userId_kind_rootUrl_key" ON "SavedSource"("userId", "kind", "rootUrl");

-- AddForeignKey
ALTER TABLE "SavedSource" ADD CONSTRAINT "SavedSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Przeniesienie danych ze starych tabel przed ich usunięciem
INSERT INTO "SavedSource" ("id", "userId", "kind", "rootUrl", "name", "summary", "createdAt", "lastUsedAt")
SELECT "id", "userId", 'organization', "rootUrl", "name", "summary", "createdAt", "lastUsedAt" FROM "UserOrganization";

INSERT INTO "SavedSource" ("id", "userId", "kind", "rootUrl", "name", "summary", "createdAt", "lastUsedAt")
SELECT "id", "userId", 'grant', "rootUrl", "name", "summary", "createdAt", "lastUsedAt" FROM "UserGrant";

-- DropForeignKey
ALTER TABLE "UserGrant" DROP CONSTRAINT "UserGrant_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserOrganization" DROP CONSTRAINT "UserOrganization_userId_fkey";

-- DropTable
DROP TABLE "UserGrant";

-- DropTable
DROP TABLE "UserOrganization";
