import { Module } from '@nestjs/common';
import { IdentityServiceController } from './identity-service.controller';
import { IdentityServiceService } from './identity-service.service';

@Module({
  imports: [],
  controllers: [IdentityServiceController],
  providers: [IdentityServiceService],
})
export class IdentityServiceModule {}
