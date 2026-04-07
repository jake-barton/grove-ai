-- CreateTable
CREATE TABLE "memory" (
    "id" TEXT NOT NULL,
    "session_key" TEXT NOT NULL DEFAULT 'global',
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memory_session_key_namespace_key_key" ON "memory"("session_key", "namespace", "key");
