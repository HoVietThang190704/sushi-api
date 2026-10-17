import { Controller, Get } from '@nestjs/common';
import { IdentityServiceService } from './identity-service.service';

@Controller()
export class IdentityServiceController {
  constructor(private readonly identityServiceService: IdentityServiceService) {}

  @Get()
  getHello(): string {
    return this.identityServiceService.getHello();
  }
}
