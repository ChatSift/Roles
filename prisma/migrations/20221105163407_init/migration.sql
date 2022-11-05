-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "promptId" INTEGER NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "color" TEXT,
    "useButtons" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_roleId_promptId_key" ON "Role"("roleId", "promptId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
