import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MatchEventDetectorService } from './match-event-detector.service'
import { NotificationService } from './notification.service'
import { MatchEvent, EVENT_PRIORITY } from './match-event.types'

const DEFAULT_INTERVAL_MS = 60_000 // 60 seconds

@Injectable()
export class MatchEventsScheduler implements OnModuleInit {
  private readonly logger = new Logger(MatchEventsScheduler.name)
  private intervalId: NodeJS.Timeout | null = null
  private isRunning = false
  private readonly intervalMs: number

  constructor(
    private readonly detector: MatchEventDetectorService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService
  ) {
    this.intervalMs = this.config.get<number>('MATCH_EVENTS_INTERVAL_MS') || DEFAULT_INTERVAL_MS
  }

  onModuleInit() {
    const enabled = this.config.get<string>('ENABLE_MATCH_EVENTS') !== 'false'

    if (enabled) {
      this.start()
    } else {
      this.logger.log('⏸️ Match events detection is disabled')
    }
  }

  /**
   * Start the detection loop
   */
  start(): void {
    if (this.intervalId) {
      this.logger.warn('Scheduler already running')
      return
    }

    this.logger.log(`🚀 Starting match events detection (interval: ${this.intervalMs}ms)`)

    // Run immediately
    this.runDetection()

    // Then schedule recurring
    this.intervalId = setInterval(() => {
      this.runDetection()
    }, this.intervalMs)
  }

  /**
   * Stop the detection loop
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      this.logger.log('⏹️ Stopped match events detection')
    }
  }

  /**
   * Run a single detection cycle
   */
  private async runDetection(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Detection already in progress, skipping')
      return
    }

    this.isRunning = true

    try {
      const startTime = Date.now()

      // Detect events
      const events = await this.detector.detectEvents()

      if (events.length > 0) {
        // Log detected events
        this.logEvents(events)

        // Send notifications
        await this.notifications.processEvents(events)
      }

      const duration = Date.now() - startTime
      if (events.length > 0 || duration > 5000) {
        this.logger.log(`✅ Detection cycle completed in ${duration}ms (${events.length} events)`)
      }
    } catch (error) {
      this.logger.error(`❌ Detection cycle failed: ${error.message}`)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Log detected events with formatting
   */
  private logEvents(events: MatchEvent[]): void {
    for (const event of events) {
      const priority = EVENT_PRIORITY[event.type]
      const emoji = this.getEventEmoji(event)

      if (priority === 'high') {
        this.logger.log(
          `${emoji} [HIGH] ${event.type}: ${event.homeTeam} ${event.scoreHome}-${event.scoreAway} ${event.awayTeam} (${event.minute}')`
        )
      } else if (priority === 'medium') {
        this.logger.log(
          `${emoji} [MED] ${event.type}: ${event.homeTeam} vs ${event.awayTeam}`
        )
      } else {
        this.logger.debug(
          `${emoji} [LOW] ${event.type}: ${event.teamName} - ${event.player || 'N/A'}`
        )
      }
    }
  }

  /**
   * Get emoji for event type
   */
  private getEventEmoji(event: MatchEvent): string {
    const emojiMap: Record<string, string> = {
      GOAL: '⚽',
      OWN_GOAL: '⚽',
      PENALTY: '⚽',
      RED_CARD: '🟥',
      YELLOW_CARD: '🟨',
      MATCH_START: '🏁',
      MATCH_END: '🔚',
      HALF_TIME: '⏸️',
      SECOND_HALF_START: '▶️',
      VAR_GOAL_CANCELLED: '❌',
      VAR_PENALTY: '⚠️',
      SUBSTITUTION: '🔄',
    }
    return emojiMap[event.type] || '📢'
  }

  /**
   * Force a manual detection (useful for testing)
   */
  async forceDetection(): Promise<MatchEvent[]> {
    this.logger.log('🔧 Forced detection triggered')
    const events = await this.detector.detectEvents()
    if (events.length > 0) {
      await this.notifications.processEvents(events)
    }
    return events
  }

  /**
   * Get scheduler status
   */
  getStatus(): { running: boolean; intervalMs: number } {
    return {
      running: !!this.intervalId,
      intervalMs: this.intervalMs,
    }
  }
}
