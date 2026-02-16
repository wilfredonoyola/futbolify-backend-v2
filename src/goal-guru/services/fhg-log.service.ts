import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { FhgLog, FhgLogDocument } from '../schemas/fhg-log.schema'
import { FhgLogLevel } from '../enums/fhg-log-level.enum'
import { FhgLogCategory } from '../enums/fhg-log-category.enum'
import { FhgLogEntryDto, FhgLogFilterInput } from '../dto/fhg-log-entry.dto'
import { LOG_BUFFER_SIZE } from '../constants/fhg-config'

interface LogContext {
  matchId?: string
  pipelineId?: string
  selectionId?: string
}

/**
 * FHG Log Service
 * Provides logging for FHG-ENGINE with both console output and MongoDB persistence
 * Logs are visible in frontend for transparency
 */
@Injectable()
export class FhgLogService {
  private readonly logger = new Logger('FHG-ENGINE')
  private buffer: FhgLogEntryDto[] = []

  constructor(
    @InjectModel(FhgLog.name)
    private fhgLogModel: Model<FhgLogDocument>
  ) {}

  /**
   * Log a message to console and persist to MongoDB
   */
  async log(
    level: FhgLogLevel,
    category: FhgLogCategory,
    message: string,
    data?: Record<string, unknown>,
    context?: LogContext
  ): Promise<void> {
    const timestamp = new Date()
    const prefix = `[${category}]`

    // Console logging with appropriate level
    const consoleMessage = `${prefix} ${message}`
    switch (level) {
      case FhgLogLevel.DEBUG:
        this.logger.debug(consoleMessage)
        break
      case FhgLogLevel.INFO:
        this.logger.log(consoleMessage)
        break
      case FhgLogLevel.WARN:
        this.logger.warn(consoleMessage)
        break
      case FhgLogLevel.ERROR:
        this.logger.error(consoleMessage)
        break
    }

    // Log data if present (DEBUG level only logs to console for data)
    if (data && level !== FhgLogLevel.DEBUG) {
      this.logger.debug(`${prefix} Data: ${JSON.stringify(data, null, 2)}`)
    }

    // Persist to MongoDB
    try {
      const logEntry = await this.fhgLogModel.create({
        level,
        category,
        message,
        data,
        matchId: context?.matchId,
        pipelineId: context?.pipelineId,
        selectionId: context?.selectionId,
        timestamp,
      })

      // Add to buffer for quick access
      const dto: FhgLogEntryDto = {
        id: logEntry._id.toString(),
        level: logEntry.level,
        category: logEntry.category,
        message: logEntry.message,
        data: logEntry.data,
        matchId: logEntry.matchId,
        pipelineId: logEntry.pipelineId,
        selectionId: logEntry.selectionId,
        timestamp: logEntry.timestamp,
      }

      this.buffer.unshift(dto)
      if (this.buffer.length > LOG_BUFFER_SIZE) {
        this.buffer.pop()
      }
    } catch (error) {
      this.logger.error(`Failed to persist log: ${error}`)
    }
  }

  // Convenience methods for each log level
  async debug(
    category: FhgLogCategory,
    message: string,
    data?: Record<string, unknown>,
    context?: LogContext
  ): Promise<void> {
    await this.log(FhgLogLevel.DEBUG, category, message, data, context)
  }

  async info(
    category: FhgLogCategory,
    message: string,
    data?: Record<string, unknown>,
    context?: LogContext
  ): Promise<void> {
    await this.log(FhgLogLevel.INFO, category, message, data, context)
  }

  async warn(
    category: FhgLogCategory,
    message: string,
    data?: Record<string, unknown>,
    context?: LogContext
  ): Promise<void> {
    await this.log(FhgLogLevel.WARN, category, message, data, context)
  }

  async error(
    category: FhgLogCategory,
    message: string,
    data?: Record<string, unknown>,
    context?: LogContext
  ): Promise<void> {
    await this.log(FhgLogLevel.ERROR, category, message, data, context)
  }

  /**
   * Get recent logs from buffer (fast)
   */
  getRecentLogs(limit = 100, category?: FhgLogCategory): FhgLogEntryDto[] {
    let logs = this.buffer
    if (category) {
      logs = logs.filter((l) => l.category === category)
    }
    return logs.slice(0, limit)
  }

  /**
   * Get logs from MongoDB with filters
   */
  async getLogs(filter: FhgLogFilterInput): Promise<FhgLogEntryDto[]> {
    const query: Record<string, unknown> = {}

    if (filter.level) {
      query.level = filter.level
    }
    if (filter.category) {
      query.category = filter.category
    }
    if (filter.matchId) {
      query.matchId = filter.matchId
    }
    if (filter.pipelineId) {
      query.pipelineId = filter.pipelineId
    }
    if (filter.startDate || filter.endDate) {
      query.timestamp = {}
      if (filter.startDate) {
        (query.timestamp as Record<string, unknown>).$gte = filter.startDate
      }
      if (filter.endDate) {
        (query.timestamp as Record<string, unknown>).$lte = filter.endDate
      }
    }

    const logs = await this.fhgLogModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(filter.offset || 0)
      .limit(filter.limit || 100)
      .exec()

    return logs.map((log) => ({
      id: log._id.toString(),
      level: log.level,
      category: log.category,
      message: log.message,
      data: log.data,
      matchId: log.matchId,
      pipelineId: log.pipelineId,
      selectionId: log.selectionId,
      timestamp: log.timestamp,
    }))
  }

  /**
   * Log a pipeline step with standardized format
   */
  async logPipelineStep(
    pipelineId: string,
    step: number,
    totalSteps: number,
    description: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.info(
      FhgLogCategory.PIPELINE,
      `Step ${step}/${totalSteps}: ${description}`,
      data,
      { pipelineId }
    )
  }

  /**
   * Log prediction calculation details
   */
  async logPrediction(
    matchId: string,
    pReal: number,
    pBase: number,
    factors: Array<{ name: string; value: number; reason: string }>
  ): Promise<void> {
    await this.info(
      FhgLogCategory.PREDICTION,
      `P_real = ${(pReal * 100).toFixed(2)}% (base: ${(pBase * 100).toFixed(2)}%)`,
      { factors },
      { matchId }
    )
  }

  /**
   * Log value evaluation
   */
  async logValue(
    matchId: string,
    pReal: number,
    odds: number,
    marginValor: number,
    signal: string
  ): Promise<void> {
    const formula = `marginValor = (${odds.toFixed(2)} × ${(pReal * 100).toFixed(1)}%) - 1 = ${(marginValor * 100).toFixed(2)}%`
    await this.info(
      FhgLogCategory.VALUE,
      `${formula} → Signal ${signal}`,
      { pReal, odds, marginValor, signal },
      { matchId }
    )
  }

  /**
   * Log selection creation
   */
  async logSelection(
    selectionId: string,
    matchId: string,
    homeTeam: string,
    awayTeam: string,
    signal: string,
    marginValor: number,
    stake: number
  ): Promise<void> {
    await this.info(
      FhgLogCategory.SELECTION,
      `Created: ${homeTeam} vs ${awayTeam} | Signal ${signal} | Margin ${(marginValor * 100).toFixed(2)}% | Stake ${(stake * 100).toFixed(1)}%`,
      { homeTeam, awayTeam, signal, marginValor, stake },
      { matchId, selectionId }
    )
  }

  /**
   * Log settlement
   */
  async logSettlement(
    selectionId: string,
    matchId: string,
    outcome: string,
    clv: number | null,
    profitLoss: number
  ): Promise<void> {
    const clvStr = clv !== null ? `${(clv * 100).toFixed(2)}%` : 'N/A'
    await this.info(
      FhgLogCategory.SETTLEMENT,
      `Settled: ${outcome} | CLV ${clvStr} | P/L ${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(4)}`,
      { outcome, clv, profitLoss },
      { matchId, selectionId }
    )
  }
}
