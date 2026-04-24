import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service';

@Global()
@Module({
  providers: [MetricsService],
  exports: [MetricsService],
})
export class CommonModule {}
