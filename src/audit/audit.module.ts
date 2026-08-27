import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditService } from './audit.service';
import { UserEvent } from './entities/user-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserEvent])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
