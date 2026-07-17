-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_role_createdAt_idx" ON "Message"("role", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");

-- CreateIndex
CREATE INDEX "ScrapedPage_sourceId_idx" ON "ScrapedPage"("sourceId");

-- CreateIndex
CREATE INDEX "ScrapedSource_conversationId_idx" ON "ScrapedSource"("conversationId");

-- CreateIndex
CREATE INDEX "ScrapedSource_rootUrl_idx" ON "ScrapedSource"("rootUrl");
