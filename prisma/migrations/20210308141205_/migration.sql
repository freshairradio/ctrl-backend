-- CreateTable
CREATE TABLE "Episode" (
    "identifier" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "slug" TEXT,
    "audio" TEXT,
    "meta" JSONB,
    "scheduling" JSONB,
    "created" TIMESTAMP(6),
    "updated" TIMESTAMP(6),
    "showIdentifier" UUID NOT NULL,

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "Credential" (
    "identifier" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "userIdentifier" UUID NOT NULL,

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "User" (
    "identifier" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "details" JSONB,
    "created" TIMESTAMP(6),
    "updated" TIMESTAMP(6),

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "Role" (
    "identifier" UUID NOT NULL,
    "name" TEXT NOT NULL,

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "Show" (
    "identifier" UUID NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "slug" TEXT,
    "picture" TEXT,
    "meta" JSONB,
    "created" TIMESTAMP(6),
    "updated" TIMESTAMP(6),

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "TimePeriod" (
    "identifier" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "current" BOOLEAN NOT NULL,

    PRIMARY KEY ("identifier")
);

-- CreateTable
CREATE TABLE "_ShowToUser" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_RoleToUser" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_ShowToTimePeriod" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Episode.slug_unique" ON "Episode"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User.email_unique" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Show.slug_unique" ON "Show"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "_ShowToUser_AB_unique" ON "_ShowToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_ShowToUser_B_index" ON "_ShowToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_RoleToUser_AB_unique" ON "_RoleToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_RoleToUser_B_index" ON "_RoleToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ShowToTimePeriod_AB_unique" ON "_ShowToTimePeriod"("A", "B");

-- CreateIndex
CREATE INDEX "_ShowToTimePeriod_B_index" ON "_ShowToTimePeriod"("B");

-- AddForeignKey
ALTER TABLE "Episode" ADD FOREIGN KEY ("showIdentifier") REFERENCES "Show"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD FOREIGN KEY ("userIdentifier") REFERENCES "User"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShowToUser" ADD FOREIGN KEY ("A") REFERENCES "Show"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShowToUser" ADD FOREIGN KEY ("B") REFERENCES "User"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD FOREIGN KEY ("A") REFERENCES "Role"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD FOREIGN KEY ("B") REFERENCES "User"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShowToTimePeriod" ADD FOREIGN KEY ("A") REFERENCES "Show"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShowToTimePeriod" ADD FOREIGN KEY ("B") REFERENCES "TimePeriod"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;
