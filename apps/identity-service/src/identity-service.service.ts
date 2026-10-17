import { Injectable } from '@nestjs/common';

@Injectable()
export class IdentityServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
