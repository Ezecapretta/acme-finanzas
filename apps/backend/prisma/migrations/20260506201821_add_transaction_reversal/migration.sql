-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "is_reversed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reversal_of" UUID;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
