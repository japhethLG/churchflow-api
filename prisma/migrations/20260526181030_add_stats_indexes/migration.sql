-- CreateIndex
CREATE INDEX "Member_tenantId_createdAt_idx" ON "Member"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Pledge_tenantId_createdAt_idx" ON "Pledge"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Pledge_tenantId_status_idx" ON "Pledge"("tenantId", "status");
