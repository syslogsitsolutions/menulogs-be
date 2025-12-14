-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "brandDescription" TEXT,
ADD COLUMN "facebookUrl" TEXT,
ADD COLUMN "instagramUrl" TEXT,
ADD COLUMN "twitterUrl" TEXT,
ADD COLUMN "linkedinUrl" TEXT,
ADD COLUMN "youtubeUrl" TEXT,
ADD COLUMN "aboutContent" TEXT,
ADD COLUMN "aboutImage" TEXT;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN "contactContent" TEXT,
ADD COLUMN "contactImage" TEXT,
ADD COLUMN "mapEmbedUrl" TEXT;

