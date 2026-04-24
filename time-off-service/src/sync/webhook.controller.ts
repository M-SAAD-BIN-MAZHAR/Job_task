import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService, WebhookResponse } from './webhook.service';
import { WebhookPayloadDto } from './dto';

/**
 * WebhookController
 *
 * Handles incoming webhooks from HCM system for balance updates.
 * This endpoint does NOT use JWT authentication - it uses HMAC signature validation instead.
 *
 * Endpoint: POST /api/v1/balances/webhook
 * Authentication: HMAC-SHA256 signature in X-HCM-Signature header
 *
 * **Validates: Requirements 10.3, 5.1, 5.2, 5.5, 18.1**
 */
@Controller('balances')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  /**
   * POST /api/v1/balances/webhook
   * Receive and process HCM push events
   *
   * Flow:
   * 1. Extract X-HCM-Signature header
   * 2. Extract raw body for signature validation
   * 3. Validate payload structure using WebhookPayloadDto
   * 4. Call WebhookService.processWebhook()
   * 5. Return appropriate HTTP response
   *
   * Responses:
   * - 200 OK: Webhook processed successfully
   * - 400 Bad Request: Invalid payload (validation errors)
   * - 401 Unauthorized: Invalid or missing signature
   *
   * @param signature - HMAC-SHA256 signature from X-HCM-Signature header
   * @param body - Validated webhook payload
   * @param req - Raw request object (for accessing raw body)
   * @returns WebhookResponse with processing details
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-hcm-signature') signature: string | undefined,
    @Body() body: WebhookPayloadDto,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<WebhookResponse> {
    this.logger.log('Received webhook request from HCM system');

    // Extract raw body for signature validation
    // NestJS provides rawBody when raw-body middleware is configured
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);

    this.logger.debug(`Webhook signature present: ${!!signature}`);
    this.logger.debug(`Raw body length: ${rawBody.length}`);

    // Process webhook through service (body is already validated by ValidationPipe)
    const result = await this.webhookService.processWebhook(signature, rawBody, body);

    this.logger.log(
      `Webhook processed successfully for employee ${result.employeeId}: ${result.previousBalance} → ${result.newBalance}`,
    );

    return result;
  }
}
