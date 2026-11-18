import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RedisModule } from '../redis/redis.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { SessionStateService } from './session-state.service';

@Module({
  imports: [JwtModule.register({}), RedisModule],
  providers: [JwtAuthGuard, RolesGuard, SessionStateService],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, SessionStateService],
})
export class AuthModule {}
