-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUYER', 'WORKSHOP', 'INSPECTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ManufacturingProcess" AS ENUM ('CNC_MACHINING', 'LATHE_TURNING', 'SHEET_METAL_FABRICATION', 'LASER_CUTTING', 'WELDING', 'INJECTION_MOLDING', 'CASTING', 'FORGING', 'THREE_D_PRINTING', 'POWDER_COATING');

-- CreateEnum
CREATE TYPE "MachineType" AS ENUM ('CNC_MILL', 'CNC_LATHE', 'MANUAL_LATHE', 'LASER_CUTTER', 'PRESS_BRAKE', 'PUNCH_PRESS', 'WELDING_STATION', 'INJECTION_MOLDER', 'CASTING_FURNACE', 'FORGING_HAMMER', 'THREE_D_PRINTER', 'POWDER_COATING_BOOTH', 'OTHER');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('OPERATIONAL', 'MAINTENANCE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('UNITS', 'KG');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'MATCHED', 'AWARDED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequirementType" AS ENUM ('MACHINE_TYPE', 'TOLERANCE_MM', 'PART_SIZE_MM', 'CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "totalCompletedJobs" INTEGER NOT NULL DEFAULT 0,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "machineName" TEXT NOT NULL,
    "machineType" "MachineType" NOT NULL,
    "specifications" JSONB,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "operationalStatus" "MachineStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "manufacturingProcess" "ManufacturingProcess" NOT NULL,
    "supportedMaterials" TEXT[],
    "specifications" JSONB,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopCapacity" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "availableCapacity" INTEGER NOT NULL,
    "capacityUnit" "QuantityUnit" NOT NULL DEFAULT 'UNITS',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "material" TEXT NOT NULL,
    "manufacturingProcess" "ManufacturingProcess" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityUnit" "QuantityUnit" NOT NULL DEFAULT 'UNITS',
    "deadline" TIMESTAMP(3) NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "technicalSpecifications" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequirement" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requirementType" "RequirementType" NOT NULL,
    "requirementValue" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "JobRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobInvitation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "scoreBreakdown" JSONB NOT NULL,
    "matchReasons" TEXT[],
    "rank" INTEGER NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'INVITED',
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_userId_key" ON "Workshop"("userId");

-- CreateIndex
CREATE INDEX "Workshop_verificationStatus_idx" ON "Workshop"("verificationStatus");

-- CreateIndex
CREATE INDEX "Machine_workshopId_machineType_idx" ON "Machine"("workshopId", "machineType");

-- CreateIndex
CREATE INDEX "Capability_manufacturingProcess_idx" ON "Capability"("manufacturingProcess");

-- CreateIndex
CREATE UNIQUE INDEX "Capability_workshopId_manufacturingProcess_key" ON "Capability"("workshopId", "manufacturingProcess");

-- CreateIndex
CREATE INDEX "WorkshopCapacity_workshopId_startDate_endDate_idx" ON "WorkshopCapacity"("workshopId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Job_buyerId_idx" ON "Job"("buyerId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_manufacturingProcess_status_idx" ON "Job"("manufacturingProcess", "status");

-- CreateIndex
CREATE INDEX "JobRequirement_jobId_idx" ON "JobRequirement"("jobId");

-- CreateIndex
CREATE INDEX "JobInvitation_workshopId_status_idx" ON "JobInvitation"("workshopId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobInvitation_jobId_workshopId_key" ON "JobInvitation"("jobId", "workshopId");

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopCapacity" ADD CONSTRAINT "WorkshopCapacity_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvitation" ADD CONSTRAINT "JobInvitation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvitation" ADD CONSTRAINT "JobInvitation_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
