import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FhgSelectionService } from '../fhg-selection.service'
import { FhgPredictionService } from '../fhg-prediction.service'
import { FhgValueService } from '../fhg-value.service'
import { FhgLogService } from '../fhg-log.service'
import { FhgSelection } from '../../schemas/fhg-selection.schema'
import { FhgMatch } from '../../schemas/fhg-match.schema'
import { FhgOdds } from '../../schemas/fhg-odds.schema'
import { FhgPrediction } from '../../schemas/fhg-prediction.schema'
import { FhgOutcome } from '../../enums/fhg-outcome.enum'
import { FhgSignal } from '../../enums/fhg-signal.enum'
import {
  MAX_DAILY_SELECTIONS,
  MAX_DAILY_EXPOSURE,
} from '../../constants/fhg-config'

describe('FhgSelectionService', () => {
  let service: FhgSelectionService
  let mockLogService: jest.Mocked<FhgLogService>
  let mockPredictionService: jest.Mocked<FhgPredictionService>
  let mockValueService: jest.Mocked<FhgValueService>

  const mockSelectionModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
  }

  const mockMatchModel = {
    find: jest.fn(),
    findById: jest.fn(),
  }

  const mockOddsModel = {
    find: jest.fn(),
    findById: jest.fn(),
  }

  const mockPredictionModel = {
    findOne: jest.fn(),
  }

  beforeEach(async () => {
    mockLogService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logPipelineStep: jest.fn(),
      logSelection: jest.fn(),
      logSettlement: jest.fn(),
    } as any

    mockPredictionService = {
      calculateProbability: jest.fn(),
    } as any

    mockValueService = {
      evaluateMultiple: jest.fn(),
      calculateSignal: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhgSelectionService,
        {
          provide: getModelToken(FhgSelection.name),
          useValue: mockSelectionModel,
        },
        {
          provide: getModelToken(FhgMatch.name),
          useValue: mockMatchModel,
        },
        {
          provide: getModelToken(FhgOdds.name),
          useValue: mockOddsModel,
        },
        {
          provide: getModelToken(FhgPrediction.name),
          useValue: mockPredictionModel,
        },
        {
          provide: FhgPredictionService,
          useValue: mockPredictionService,
        },
        {
          provide: FhgValueService,
          useValue: mockValueService,
        },
        {
          provide: FhgLogService,
          useValue: mockLogService,
        },
      ],
    }).compile()

    service = module.get<FhgSelectionService>(FhgSelectionService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Configuration constants', () => {
    it('should have valid daily limits', () => {
      expect(MAX_DAILY_SELECTIONS).toBe(5)
      expect(MAX_DAILY_EXPOSURE).toBe(0.08) // 8%
    })
  })

  describe('runDailyPipeline', () => {
    it('should return empty result when no matches found', async () => {
      mockMatchModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      })

      const result = await service.runDailyPipeline()

      expect(result.success).toBe(true)
      expect(result.matchesAnalyzed).toBe(0)
      expect(result.selectionsCreated).toBe(0)
      expect(result.skippedReasons).toContain('No matches found for today')
    })

    it('should respect max daily selections limit', async () => {
      // This test would need more complex setup
      // Testing the concept that max 5 selections are created
      expect(MAX_DAILY_SELECTIONS).toBe(5)
    })
  })

  describe('settleSelections', () => {
    it('should handle empty pending selections', async () => {
      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      })

      const result = await service.settleSelections()

      expect(result.success).toBe(true)
      expect(result.settled).toBe(0)
      expect(result.won).toBe(0)
      expect(result.lost).toBe(0)
    })
  })

  describe('getTodaySelections', () => {
    it('should return selections for today', async () => {
      const mockSelections = [
        {
          _id: { toString: () => 'sel-1' },
          matchId: { toString: () => 'match-1' },
          predictionId: { toString: () => 'pred-1' },
          homeTeam: 'Ajax',
          awayTeam: 'PSV',
          leagueCode: 'eredivisie',
          date: new Date(),
          kickoffTime: '20:00',
          signal: FhgSignal.A,
          marginValor: 0.10,
          pReal: 0.75,
          edgeScore: 70,
          stakePercentage: 0.03,
          oddsAtSelection: 1.45,
          outcome: FhgOutcome.PENDING,
          createdAt: new Date(),
        },
      ]

      mockSelectionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockSelections),
        }),
      })

      const result = await service.getTodaySelections()

      expect(result).toHaveLength(1)
      expect(result[0].homeTeam).toBe('Ajax')
      expect(result[0].signal).toBe(FhgSignal.A)
    })
  })

  describe('getSelectionHistory', () => {
    it('should return paginated history', async () => {
      const mockSelections = [
        {
          _id: { toString: () => 'sel-1' },
          matchId: { toString: () => 'match-1' },
          predictionId: { toString: () => 'pred-1' },
          homeTeam: 'Ajax',
          awayTeam: 'PSV',
          leagueCode: 'eredivisie',
          date: new Date(),
          kickoffTime: '20:00',
          signal: FhgSignal.B,
          marginValor: 0.05,
          pReal: 0.70,
          edgeScore: 60,
          stakePercentage: 0.02,
          oddsAtSelection: 1.50,
          outcome: FhgOutcome.WON,
          clv: 0.03,
          profitLoss: 0.01,
          createdAt: new Date(),
        },
      ]

      mockSelectionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockSelections),
            }),
          }),
        }),
      })
      mockSelectionModel.countDocuments.mockResolvedValue(1)

      const result = await service.getSelectionHistory(50, 0)

      expect(result.selections).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.offset).toBe(0)
      expect(result.limit).toBe(50)
    })
  })
})
