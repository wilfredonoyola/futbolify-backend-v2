import { Injectable, Logger } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'
import {
  MatchEvent,
  MatchEventType,
  MatchState,
  MatchEventSnapshot,
  EventDetectionResult,
} from './match-event.types'
import { RedisCacheService } from '../../common/redis-cache.service'
import { ApiFootballLiveService, LiveMatchData } from '../api-football-live.service'

const CACHE_KEY_PREFIX = 'match-state:'
const STATE_TTL = 7200 // 2 hours - keep state for finished matches

@Injectable()
export class MatchEventDetectorService {
  private readonly logger = new Logger(MatchEventDetectorService.name)

  constructor(
    private readonly redis: RedisCacheService,
    private readonly apiFootball: ApiFootballLiveService
  ) {}

  /**
   * Main detection loop - call this every ~60 seconds
   * Returns all new events detected across all live matches
   */
  async detectEvents(): Promise<MatchEvent[]> {
    const allEvents: MatchEvent[] = []

    try {
      // Get current live matches
      const liveMatches = await this.apiFootball.getLiveMatches()

      if (!liveMatches.length) {
        this.logger.debug('No live matches to check')
        return []
      }

      this.logger.log(`🔍 Checking ${liveMatches.length} live matches for events`)

      // Check each match for new events
      for (const match of liveMatches) {
        const result = await this.detectMatchEvents(match)
        if (result.newEvents.length > 0) {
          allEvents.push(...result.newEvents)
        }
      }

      if (allEvents.length > 0) {
        this.logger.log(`🎯 Detected ${allEvents.length} new events`)
      }

      return allEvents
    } catch (error) {
      this.logger.error(`Error detecting events: ${error.message}`)
      return []
    }
  }

  /**
   * Detect events for a single match by comparing with previous state
   */
  async detectMatchEvents(match: LiveMatchData): Promise<EventDetectionResult> {
    const fixtureId = match.id
    const cacheKey = `${CACHE_KEY_PREFIX}${fixtureId}`

    // Get previous state from Redis
    const previousState = await this.redis.get<MatchState>(cacheKey)

    // Build current state
    const currentState = this.buildMatchState(match)

    // Detect new events
    const newEvents = this.compareStates(previousState, currentState, match)

    // Save current state to Redis
    await this.redis.set(cacheKey, currentState, STATE_TTL)

    return {
      fixtureId,
      newEvents,
      stateChanged: newEvents.length > 0,
    }
  }

  /**
   * Build a MatchState from LiveMatchData
   */
  private buildMatchState(match: LiveMatchData): MatchState {
    return {
      fixtureId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      scoreHome: match.scoreHome,
      scoreAway: match.scoreAway,
      status: match.status,
      minute: match.minute,
      leagueId: match.leagueId,
      leagueName: match.leagueName,
      leagueLogo: match.leagueLogo,
      events: (match.events || []).map((e) => ({
        type: e.type,
        team: e.team,
        player: e.player,
        minute: e.time,
        detail: e.detail,
      })),
      lastUpdated: new Date(),
    }
  }

  /**
   * Compare previous and current states to detect new events
   */
  private compareStates(
    previous: MatchState | null,
    current: MatchState,
    match: LiveMatchData
  ): MatchEvent[] {
    const events: MatchEvent[] = []

    // If no previous state, this is a new match - check if just started
    if (!previous) {
      if (current.status === '1H' && current.minute <= 5) {
        events.push(this.createEvent(MatchEventType.MATCH_START, current, match))
      }
      return events
    }

    // Detect status changes
    const statusEvents = this.detectStatusChanges(previous, current, match)
    events.push(...statusEvents)

    // Detect score changes (goals)
    const goalEvents = this.detectGoals(previous, current, match)
    events.push(...goalEvents)

    // Detect new events from timeline
    const timelineEvents = this.detectTimelineEvents(previous, current, match)
    events.push(...timelineEvents)

    return events
  }

  /**
   * Detect status/phase changes
   */
  private detectStatusChanges(
    previous: MatchState,
    current: MatchState,
    match: LiveMatchData
  ): MatchEvent[] {
    const events: MatchEvent[] = []

    // Match start
    if (previous.status === 'NS' && current.status === '1H') {
      events.push(this.createEvent(MatchEventType.MATCH_START, current, match))
    }

    // Half time
    if (previous.status === '1H' && current.status === 'HT') {
      events.push(this.createEvent(MatchEventType.HALF_TIME, current, match))
    }

    // Second half start
    if (previous.status === 'HT' && current.status === '2H') {
      events.push(this.createEvent(MatchEventType.SECOND_HALF_START, current, match))
    }

    // Extra time
    if (previous.status === '2H' && current.status === 'ET') {
      events.push(this.createEvent(MatchEventType.EXTRA_TIME_START, current, match))
    }

    // Penalty shootout
    if ((previous.status === '2H' || previous.status === 'ET') && current.status === 'P') {
      events.push(this.createEvent(MatchEventType.PENALTY_SHOOTOUT_START, current, match))
    }

    // Match end
    if (
      ['1H', '2H', 'ET', 'P'].includes(previous.status) &&
      ['FT', 'AET', 'PEN'].includes(current.status)
    ) {
      events.push(this.createEvent(MatchEventType.MATCH_END, current, match))
    }

    return events
  }

  /**
   * Detect goals by comparing scores
   */
  private detectGoals(
    previous: MatchState,
    current: MatchState,
    match: LiveMatchData
  ): MatchEvent[] {
    const events: MatchEvent[] = []

    const homeGoalsDiff = current.scoreHome - previous.scoreHome
    const awayGoalsDiff = current.scoreAway - previous.scoreAway

    // Home team scored
    if (homeGoalsDiff > 0) {
      const goalEvent = this.findGoalEvent(current.events, previous.events, match.homeTeam)
      for (let i = 0; i < homeGoalsDiff; i++) {
        events.push(
          this.createGoalEvent(
            current,
            match,
            'home',
            goalEvent?.player,
            goalEvent?.detail
          )
        )
      }
    }

    // Away team scored
    if (awayGoalsDiff > 0) {
      const goalEvent = this.findGoalEvent(current.events, previous.events, match.awayTeam)
      for (let i = 0; i < awayGoalsDiff; i++) {
        events.push(
          this.createGoalEvent(
            current,
            match,
            'away',
            goalEvent?.player,
            goalEvent?.detail
          )
        )
      }
    }

    return events
  }

  /**
   * Find the goal event from timeline
   */
  private findGoalEvent(
    currentEvents: MatchEventSnapshot[],
    previousEvents: MatchEventSnapshot[],
    teamName: string
  ): MatchEventSnapshot | undefined {
    const previousMinutes = new Set(
      previousEvents
        .filter((e) => e.type === 'Goal' && e.team === teamName)
        .map((e) => `${e.minute}-${e.player}`)
    )

    return currentEvents.find(
      (e) =>
        e.type === 'Goal' &&
        e.team === teamName &&
        !previousMinutes.has(`${e.minute}-${e.player}`)
    )
  }

  /**
   * Detect events from timeline (cards, substitutions, etc.)
   */
  private detectTimelineEvents(
    previous: MatchState,
    current: MatchState,
    match: LiveMatchData
  ): MatchEvent[] {
    const events: MatchEvent[] = []

    // Create a set of previous event signatures
    const previousSignatures = new Set(
      previous.events.map((e) => `${e.type}-${e.minute}-${e.player}-${e.team}`)
    )

    // Find new events
    for (const event of current.events) {
      const signature = `${event.type}-${event.minute}-${event.player}-${event.team}`
      if (previousSignatures.has(signature)) continue

      // Skip goals - already handled by score comparison
      if (event.type === 'Goal') continue

      const isHome = event.team === match.homeTeam
      const teamSide: 'home' | 'away' = isHome ? 'home' : 'away'

      // Red card
      if (event.type === 'Card' && event.detail?.includes('Red')) {
        events.push(
          this.createEvent(MatchEventType.RED_CARD, current, match, {
            team: teamSide,
            player: event.player,
            detail: event.detail,
          })
        )
      }

      // Yellow card
      if (event.type === 'Card' && event.detail?.includes('Yellow') && !event.detail?.includes('Red')) {
        events.push(
          this.createEvent(MatchEventType.YELLOW_CARD, current, match, {
            team: teamSide,
            player: event.player,
            detail: event.detail,
          })
        )
      }

      // VAR decisions
      if (event.type === 'Var') {
        if (event.detail?.toLowerCase().includes('goal cancelled')) {
          events.push(this.createEvent(MatchEventType.VAR_GOAL_CANCELLED, current, match))
        } else if (event.detail?.toLowerCase().includes('penalty')) {
          events.push(this.createEvent(MatchEventType.VAR_PENALTY, current, match, {
            team: teamSide,
          }))
        }
      }

      // Penalty (from events, not goals)
      if (event.type === 'Goal' && event.detail?.toLowerCase().includes('penalty')) {
        // Already counted in goals
      }

      // Missed penalty
      if (event.detail?.toLowerCase().includes('penalty') &&
          event.detail?.toLowerCase().includes('missed')) {
        events.push(
          this.createEvent(MatchEventType.MISSED_PENALTY, current, match, {
            team: teamSide,
            player: event.player,
          })
        )
      }
    }

    return events
  }

  /**
   * Create a goal event
   */
  private createGoalEvent(
    state: MatchState,
    match: LiveMatchData,
    team: 'home' | 'away',
    player?: string,
    detail?: string
  ): MatchEvent {
    const isOwnGoal = detail?.toLowerCase().includes('own goal')
    const isPenalty = detail?.toLowerCase().includes('penalty')

    let eventType = MatchEventType.GOAL
    if (isOwnGoal) eventType = MatchEventType.OWN_GOAL
    else if (isPenalty) eventType = MatchEventType.PENALTY

    return this.createEvent(eventType, state, match, { team, player, detail })
  }

  /**
   * Create a MatchEvent
   */
  private createEvent(
    type: MatchEventType,
    state: MatchState,
    match: LiveMatchData,
    extra?: { team?: 'home' | 'away'; player?: string; assist?: string; detail?: string }
  ): MatchEvent {
    const team = extra?.team || 'home'
    return {
      id: uuidv4(),
      fixtureId: state.fixtureId,
      type,
      timestamp: new Date(),
      minute: state.minute,
      team,
      teamName: team === 'home' ? state.homeTeam : state.awayTeam,
      player: extra?.player,
      assist: extra?.assist,
      detail: extra?.detail,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      homeTeam: state.homeTeam,
      awayTeam: state.awayTeam,
      leagueId: state.leagueId,
      leagueName: state.leagueName,
    }
  }

  /**
   * Clear all match states from cache
   */
  async clearAllStates(): Promise<void> {
    await this.redis.deletePattern(`${CACHE_KEY_PREFIX}*`)
    this.logger.log('Cleared all match states')
  }

  /**
   * Get current state for a match
   */
  async getMatchState(fixtureId: number): Promise<MatchState | null> {
    return this.redis.get<MatchState>(`${CACHE_KEY_PREFIX}${fixtureId}`)
  }
}
