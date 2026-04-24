import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HcmClientAdapter } from './hcm-client.adapter';
import { HCM_CLIENT } from './hcm-client.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: HCM_CLIENT,
      useClass: HcmClientAdapter,
    },
  ],
  exports: [HCM_CLIENT],
})
export class HcmModule {}
