import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { BalanceService } from './balance.service';
import { SyncService } from '../sync/sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BalanceResponseDto, LedgerQueryDto } from './dto';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';

@Controller('balances')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BalanceController {
  private readonly logger = new Logger(BalanceController.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly syncService: SyncService,
  ) {}

  /**
   * GET /api/v1/balances/:employeeId
   * Get current balance with staleness indicator
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   */
  @Get(':employeeId')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Request() req: any,
  ): Promise<BalanceResponseDto> {
    this.logger.log(`GET /balances/${employeeId} - User: ${req.user.sub}, Role: ${req.user.role}`);

    // Access control: EMPLOYEE can only access their own balance
    if (req.user.role === 'EMPLOYEE' && req.user.sub !== employeeId) {
      throw new ForbiddenException('Employees can only access their own balance');
    }

    const balance = await this.balanceService.getBalance(employeeId);

    // Calculate staleness
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStale = balance.lastSyncedAt < fiveMinutesAgo;

    return {
      employeeId: balance.employeeId,
      availableHours: balance.availableHours,
      accruedHours: balance.accruedHours,
      usedHours: balance.usedHours,
      lastSyncedAt: balance.lastSyncedAt.toISOString(),
      isStale,
      staleSince: isStale ? balance.lastSyncedAt.toISOString() : undefined,
    };
  }

  /**
   * POST /api/v1/balances/:employeeId/sync
   * Trigger on-demand HCM sync
   * Access: MANAGER, ADMIN
   */
  @Post(':employeeId/sync')
  @Roles('MANAGER', 'ADMIN')
  async syncBalance(
    @Param('employeeId') employeeId: string,
    @Request() req: any,
  ): Promise<BalanceResponseDto> {
    this.logger.log(
      `POST /balances/${employeeId}/sync - User: ${req.user.sub}, Role: ${req.user.role}`,
    );

    try {
      // Trigger sync via SyncService
      const result = await this.syncService.syncEmployee(employeeId);

      // Fetch updated balance
      const balance = await this.balanceService.getBalance(employeeId);

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isStale = balance.lastSyncedAt < fiveMinutesAgo;

      this.logger.log(
        `Sync completed for ${employeeId}: driftDetected=${result.driftDetected}, corrected=${result.corrected}`,
      );

      return {
        employeeId: balance.employeeId,
        availableHours: balance.availableHours,
        accruedHours: balance.accruedHours,
        usedHours: balance.usedHours,
        lastSyncedAt: balance.lastSyncedAt.toISOString(),
        isStale,
        staleSince: isStale ? balance.lastSyncedAt.toISOString() : undefined,
      };
    } catch (error) {
      // If HCM is unavailable, return cached balance with error indication
      if (error.code === 'HCM_UNAVAILABLE') {
        this.logger.warn(`HCM unavailable during sync for ${employeeId}, serving cached data`);
        const balance = await this.balanceService.getBalance(employeeId);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isStale = balance.lastSyncedAt < fiveMinutesAgo;

        return {
          employeeId: balance.employeeId,
          availableHours: balance.availableHours,
          accruedHours: balance.accruedHours,
          usedHours: balance.usedHours,
          lastSyncedAt: balance.lastSyncedAt.toISOString(),
          isStale: true, // Always mark as stale when HCM is unavailable
          staleSince: balance.lastSyncedAt.toISOString(),
        };
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/balances/:employeeId/ledger
   * Get full ledger history
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   */
  @Get(':employeeId/ledger')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async getLedgerHistory(
    @Param('employeeId') employeeId: string,
    @Query() query: LedgerQueryDto,
    @Request() req: any,
  ): Promise<LedgerEntry[]> {
    this.logger.log(
      `GET /balances/${employeeId}/ledger - User: ${req.user.sub}, Role: ${req.user.role}`,
    );

    // Access control: EMPLOYEE can only access their own ledger
    if (req.user.role === 'EMPLOYEE' && req.user.sub !== employeeId) {
      throw new ForbiddenException('Employees can only access their own ledger history');
    }

    // Build filters from query params
    const filters: any = {};
    if (query.startDate) {
      filters.startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      filters.endDate = new Date(query.endDate);
    }
    if (query.operation) {
      filters.operation = query.operation;
    }
    if (query.source) {
      filters.source = query.source;
    }

    return this.balanceService.getLedgerHistory(employeeId);
  }
}
