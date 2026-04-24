import { Module } from '@nestjs/common';

import { TransactionRepository } from './repository/transaction.repository';
import { TransactionService } from './services/transaction.service';

@Module({
  providers: [TransactionRepository, TransactionService],
  exports: [TransactionService],
})
export class TransactionCoreModule {}
