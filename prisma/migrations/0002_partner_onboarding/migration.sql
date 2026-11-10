-- AlterTable
ALTER TABLE `User` ADD COLUMN `partnerCode` VARCHAR(191) NULL,
    ADD COLUMN `constitution` VARCHAR(191) NULL,
    ADD COLUMN `pan` VARCHAR(191) NULL,
    ADD COLUMN `gstin` VARCHAR(191) NULL,
    ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `state` VARCHAR(191) NULL,
    ADD COLUMN `pincode` VARCHAR(191) NULL,
    ADD COLUMN `onboardingSource` VARCHAR(191) NULL,
    ADD COLUMN `reviewRemark` TEXT NULL,
    ADD COLUMN `reviewedByName` VARCHAR(191) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Proposal` ADD COLUMN `feasibleAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PartnerDocument` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(512) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(255) NOT NULL,
    `size` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UPLOADED',
    `uploadedById` VARCHAR(191) NULL,
    `uploadedByName` VARCHAR(191) NOT NULL,
    `verifiedByName` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerDocument_userId_type_idx`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_tenantId_partnerCode_key` ON `User`(`tenantId`, `partnerCode`);

-- AddForeignKey
ALTER TABLE `PartnerDocument` ADD CONSTRAINT `PartnerDocument_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Feasibility now comes after documents. Cases that already passed feasibility under the old order keep that decision.
UPDATE `Proposal` SET `feasibleAt` = COALESCE(`submittedAt`, `createdAt`) WHERE `status` NOT IN ('DRAFT', 'SUBMITTED', 'RM_ASSIGNED', 'NOT_FEASIBLE');

-- Show the TAT steps in the new order (documents, then feasibility).
UPDATE `TatSetting` SET `sortOrder` = 1, `label` = 'Documents uploaded by DSA' WHERE `key` = 'docs_upload';

UPDATE `TatSetting` SET `sortOrder` = 2, `label` = 'Feasibility check after documents received' WHERE `key` = 'feasibility';
