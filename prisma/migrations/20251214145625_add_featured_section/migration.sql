-- CreateTable
CREATE TABLE "featured_sections" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "buttonText" TEXT,
    "buttonLink" TEXT,
    "imagePosition" TEXT NOT NULL DEFAULT 'left',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "featured_sections_locationId_idx" ON "featured_sections"("locationId");

-- CreateIndex
CREATE INDEX "featured_sections_isActive_idx" ON "featured_sections"("isActive");

-- AddForeignKey
ALTER TABLE "featured_sections" ADD CONSTRAINT "featured_sections_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

