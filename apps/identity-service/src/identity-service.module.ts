import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '@common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';
import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';
import { BranchDirectoryService } from './staff/branch-directory.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    AuthModule,
  ],
  controllers: [AuthController, StaffController],
  providers: [AuthService, PrismaService, StaffService, BranchDirectoryService],
  exports: [AuthService, PrismaService],
})
export class IdentityServiceModule {}
