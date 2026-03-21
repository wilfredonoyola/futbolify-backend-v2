import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportType, ReportReason, ReportStatus } from './schemas/report.schema';
import {
  GenerateReportInput,
  LegacyGenerateReportInput,
  GenerateReportResponse,
  ReportReasonOutput,
  ReportOutput,
  ReportsListResponse,
  LEGACY_REASON_MAP,
  LEGACY_TYPE_MAP,
} from './dto/report.dto';

interface UserInfo {
  id: string;
  email?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<Report>,
  ) {}

  /**
   * Get available report reasons
   * Returns a list of reasons that can be used when reporting content
   */
  async getReportReasons(): Promise<ReportReasonOutput[]> {
    const reasons: ReportReasonOutput[] = [
      {
        id: '1',
        value: ReportReason.SPAM,
        title: 'Spam',
        description: 'Contenido repetitivo o no deseado',
      },
      {
        id: '2',
        value: ReportReason.HARASSMENT,
        title: 'Acoso',
        description: 'Comportamiento abusivo hacia una persona',
      },
      {
        id: '3',
        value: ReportReason.HATE_SPEECH,
        title: 'Incitación al odio',
        description: 'Contenido que promueve odio o discriminación',
      },
      {
        id: '4',
        value: ReportReason.VIOLENCE,
        title: 'Violencia',
        description: 'Contenido violento o amenazante',
      },
      {
        id: '5',
        value: ReportReason.NUDITY,
        title: 'Desnudez o contenido sexual',
        description: 'Contenido inapropiado para menores',
      },
      {
        id: '6',
        value: ReportReason.FALSE_INFORMATION,
        title: 'Información falsa',
        description: 'Noticias falsas o desinformación',
      },
      {
        id: '7',
        value: ReportReason.SCAM,
        title: 'Estafa o fraude',
        description: 'Intento de engañar o robar',
      },
      {
        id: '8',
        value: ReportReason.INAPPROPRIATE,
        title: 'Contenido inapropiado',
        description: 'No cumple con las normas de la comunidad',
      },
      {
        id: '9',
        value: ReportReason.COPYRIGHT,
        title: 'Infracción de derechos de autor',
        description: 'Uso no autorizado de contenido protegido',
      },
      {
        id: '10',
        value: ReportReason.OTHER,
        title: 'Otro',
        description: 'Otra razón no listada',
      },
    ];

    return reasons;
  }

  /**
   * Generate a new report
   */
  async generateReport(
    input: GenerateReportInput,
    userInfo: UserInfo,
  ): Promise<GenerateReportResponse> {
    try {
      // Check if user already reported this content
      const existingReport = await this.reportModel.findOne({
        reportType: input.reportType,
        referenceId: input.referenceId,
        reporterId: userInfo.id,
      });

      if (existingReport) {
        return {
          data: { success: true, reportId: existingReport.id },
          message: 'Ya has reportado este contenido anteriormente',
        };
      }

      // Create new report
      const report = new this.reportModel({
        reportType: input.reportType,
        referenceId: input.referenceId,
        reason: input.reason,
        additionalInfo: input.additionalInfo,
        reporterId: userInfo.id,
        reporterEmail: userInfo.email,
        status: ReportStatus.PENDING,
      });

      await report.save();

      return {
        data: { success: true, reportId: report.id },
        message: 'Reporte enviado correctamente. Gracias por ayudarnos a mantener la comunidad segura.',
      };
    } catch (error) {
      console.error('Error generating report:', error);
      return {
        data: { success: false },
        errors: ['Error al enviar el reporte. Por favor intenta de nuevo.'],
      };
    }
  }

  /**
   * Generate report using legacy input format (backwards compatibility)
   */
  async generateReportLegacy(
    input: LegacyGenerateReportInput,
    userInfo: UserInfo,
  ): Promise<GenerateReportResponse> {
    // Map legacy values to new enums
    const reportType = LEGACY_TYPE_MAP[input.reportType] || ReportType.POST;
    const reason = LEGACY_REASON_MAP[input.reasonId.toLowerCase()] || ReportReason.OTHER;

    return this.generateReport(
      {
        reportType,
        referenceId: input.referenceId,
        reason,
      },
      userInfo,
    );
  }

  /**
   * Get reports for admin panel (paginated)
   */
  async getReports(
    status?: ReportStatus,
    reportType?: ReportType,
    limit = 20,
    offset = 0,
  ): Promise<ReportsListResponse> {
    const filter: any = {};

    if (status) {
      filter.status = status;
    }
    if (reportType) {
      filter.reportType = reportType;
    }

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      reports: reports.map((r) => ({
        id: r.id,
        reportType: r.reportType,
        referenceId: r.referenceId,
        reason: r.reason,
        additionalInfo: r.additionalInfo,
        reporterId: r.reporterId,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      hasMore: offset + reports.length < total,
    };
  }

  /**
   * Update report status (for admin)
   */
  async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    reviewerId: string,
    resolution?: string,
  ): Promise<ReportOutput> {
    const report = await this.reportModel.findByIdAndUpdate(
      reportId,
      {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        resolution,
      },
      { new: true },
    );

    if (!report) {
      throw new NotFoundException('Reporte no encontrado');
    }

    return {
      id: report.id,
      reportType: report.reportType,
      referenceId: report.referenceId,
      reason: report.reason,
      additionalInfo: report.additionalInfo,
      reporterId: report.reporterId,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  /**
   * Get report counts by status (for admin dashboard)
   */
  async getReportCounts(): Promise<Record<ReportStatus, number>> {
    const counts = await this.reportModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result: Record<string, number> = {
      [ReportStatus.PENDING]: 0,
      [ReportStatus.REVIEWED]: 0,
      [ReportStatus.RESOLVED]: 0,
      [ReportStatus.DISMISSED]: 0,
    };

    counts.forEach((c) => {
      result[c._id] = c.count;
    });

    return result as Record<ReportStatus, number>;
  }
}
