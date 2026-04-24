import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { RequestRepository } from './repositories/request.repository';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { SagaModule } from '../saga/saga.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest]),
    AuditModule,
    BalanceModule,
    forwardRef(() => SagaModule),
  ],
  controllers: [RequestController],
  providers: [RequestService, RequestRepository],
  exports: [RequestService, RequestRepository],
})
export class RequestModule {}
