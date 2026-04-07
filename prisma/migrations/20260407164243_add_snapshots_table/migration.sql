/*
  Warnings:

  - You are about to drop the `config` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "config";

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);
