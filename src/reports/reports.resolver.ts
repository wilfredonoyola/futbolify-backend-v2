import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Report, ReportType, ReportStatus } from './schemas/report.schema';
import {
  GenerateReportInput,
  LegacyGenerateReportInput,
  GenerateReportResponse,
  ReportReasonOutput,
  ReportOutput,
  ReportsListResponse,
} from './dto/report.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface UserPayload {
  userId: string;
  email?: string;
}

@Resolver(() => Report)
export class ReportsResolver {
  constructor(private readonly reportsService: ReportsService) {}

  // ============================================
  // Public Queries
  // ============================================

  /**
   * Get available report reasons
   * Used by the app to display report options
   */
  @Query(() => [ReportReasonOutput], { name: 'getReportReasons' })
  async getReportReasons(): Promise<ReportReasonOutput[]> {
    return this.reportsService.getReportReasons();
  }

  // ============================================
  // Authenticated Mutations
  // ============================================

  /**
   * Generate a new report (new format)
   */
  @Mutation(() => GenerateReportResponse)
  @UseGuards(JwtAuthGuard)
  async createReport(
    @Args('input') input: GenerateReportInput,
    @CurrentUser() user: UserPayload,
  ): Promise<GenerateReportResponse> {
    return this.reportsService.generateReport(input, {
      id: user.userId,
      email: user.email,
    });
  }

  /**
   * Generate a report (legacy format for backwards compatibility)
   * This matches the old API format: generateReport(GenerateReportInput: {...})
   */
  @Mutation(() => GenerateReportResponse, { name: 'generateReport' })
  @UseGuards(JwtAuthGuard)
  async generateReport(
    @Args('GenerateReportInput') input: LegacyGenerateReportInput,
    @CurrentUser() user: UserPayload,
  ): Promise<GenerateReportResponse> {
    return this.reportsService.generateReportLegacy(input, {
      id: user.userId,
      email: user.email,
    });
  }

  // ============================================
  // Admin Queries & Mutations
  // ============================================

  /**
   * Get reports list (admin only)
   */
  @Query(() => ReportsListResponse, { name: 'adminGetReports' })
  @UseGuards(JwtAuthGuard)
  // TODO: Add admin role guard
  async adminGetReports(
    @Args('status', { type: () => ReportStatus, nullable: true }) status?: ReportStatus,
    @Args('reportType', { type: () => ReportType, nullable: true }) reportType?: ReportType,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit?: number,
    @Args('offset', { type: () => Int, defaultValue: 0 }) offset?: number,
  ): Promise<ReportsListResponse> {
    return this.reportsService.getReports(status, reportType, limit, offset);
  }

  /**
   * Update report status (admin only)
   */
  @Mutation(() => ReportOutput)
  @UseGuards(JwtAuthGuard)
  // TODO: Add admin role guard
  async adminUpdateReportStatus(
    @Args('reportId') reportId: string,
    @Args('status', { type: () => ReportStatus }) status: ReportStatus,
    @Args('resolution', { nullable: true }) resolution: string,
    @CurrentUser() user: UserPayload,
  ): Promise<ReportOutput> {
    return this.reportsService.updateReportStatus(
      reportId,
      status,
      user.userId,
      resolution,
    );
  }
}
