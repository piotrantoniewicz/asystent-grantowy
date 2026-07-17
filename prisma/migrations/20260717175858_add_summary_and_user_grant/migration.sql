-- AlterTable
ALTER TABLE "UserOrganization" ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "UserGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserGrant_userId_rootUrl_key" ON "UserGrant"("userId", "rootUrl");

-- AddForeignKey
ALTER TABLE "UserGrant" ADD CONSTRAINT "UserGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
