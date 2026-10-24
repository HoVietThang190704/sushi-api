import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeConsumerService } from './realtime-consumer.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, RealtimeConsumerService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
