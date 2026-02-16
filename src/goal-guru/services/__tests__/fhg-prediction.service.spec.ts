import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FhgPredictionService } from '../fhg-prediction.service'
import { FhgLogService } from '../fhg-log.service'
import { FhgPrediction } from '../../schemas/fhg-prediction.schema'
import { FhgMatch } from '../../schemas/fhg-match.schema'
import { FhgTeam } from '../../schemas/fhg-team.schema'
import { FhgLeague } from '../../schemas/fhg-league.schema'
import { FhgTier } from '../../enums/fhg-tier.enum'
import {
  LEAGUE_TIER_FACTORS,
  P_REAL_MIN,
  P_REAL_MAX,
} from '../../constants/fhg-config'

describe('FhgPredictionService', () => {
  let service: FhgPredictionService
  let mockLogService: jest.Mocked<FhgLogService>

  const mockPredictionModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
  }

  const mockMatchModel = {
    findById: jest.fn(),
  }

  const mockTeamModel = {
    findOne: jest.fn(),
  }

  const mockLeagueModel = {
    findOne: jest.fn(),
  }

  beforeEach(async () => {
    mockLogService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logPrediction: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhgPredictionService,
        {
          provide: getModelToken(FhgPrediction.name),
          useValue: mockPredictionModel,
        },
        {
          provide: getModelToken(FhgMatch.name),
          useValue: mockMatchModel,
        },
        {
          provide: getModelToken(FhgTeam.name),
          useValue: mockTeamModel,
        },
        {
          provide: getModelToken(FhgLeague.name),
          useValue: mockLeagueModel,
        },
        {
          provide: FhgLogService,
          useValue: mockLogService,
        },
      ],
    }).compile()

    service = module.get<FhgPredictionService>(FhgPredictionService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('League tier factors', () => {
    it('should have correct tier multipliers', () => {
      expect(LEAGUE_TIER_FACTORS[FhgTier.MAX]).toBe(1.08)
      expect(LEAGUE_TIER_FACTORS[FhgTier.HIGH]).toBe(1.04)
      expect(LEAGUE_TIER_FACTORS[FhgTier.MEDIUM]).toBe(1.0)
      expect(LEAGUE_TIER_FACTORS[FhgTier.LOW]).toBe(0.96)
    })
  })

  describe('P_real constraints', () => {
    it('should have valid min/max values', () => {
      expect(P_REAL_MIN).toBe(0.4)
      expect(P_REAL_MAX).toBe(0.95)
      expect(P_REAL_MIN).toBeLessThan(P_REAL_MAX)
    })
  })

  describe('calculateProbability', () => {
    it('should return null when match not found', async () => {
      mockMatchModel.findById.mockResolvedValue(null)

      const result = await service.calculateProbability('nonexistent-id')

      expect(result).toBeNull()
      expect(mockLogService.warn).toHaveBeenCalled()
    })

    it('should return existing prediction if already calculated', async () => {
      const mockMatch = {
        _id: 'match-123',
        leagueCode: 'eredivisie',
        homeTeam: 'Ajax',
        awayTeam: 'PSV',
      }
      const mockPrediction = {
        _id: 'prediction-123',
        matchId: 'match-123',
        pReal: 0.72,
      }

      mockMatchModel.findById.mockResolvedValue(mockMatch)
      mockPredictionModel.findOne.mockResolvedValue(mockPrediction)

      const result = await service.calculateProbability('match-123')

      expect(result).toEqual({
        prediction: mockPrediction,
        created: false,
      })
    })
  })

  describe('getPredictionByMatchId', () => {
    // Use valid 24-character hex string for ObjectId
    const validMatchId = '507f1f77bcf86cd799439011'

    it('should return null when prediction not found', async () => {
      mockPredictionModel.findOne.mockResolvedValue(null)

      const result = await service.getPredictionByMatchId(validMatchId)

      expect(result).toBeNull()
    })

    it('should return prediction DTO when found', async () => {
      const mockPrediction = {
        _id: { toString: () => '507f1f77bcf86cd799439012' },
        matchId: { toString: () => validMatchId },
        homeTeam: 'Ajax',
        awayTeam: 'PSV',
        leagueCode: 'eredivisie',
        date: new Date(),
        pBase: 0.65,
        leagueAvgG1H: 0.70,
        homeG1HRate: 0.68,
        awayConcedeG1HRate: 0.55,
        pReal: 0.72,
        factors: [],
        edgeScore: 65,
        warnings: [],
        createdAt: new Date(),
      }

      mockPredictionModel.findOne.mockResolvedValue(mockPrediction)

      const result = await service.getPredictionByMatchId(validMatchId)

      expect(result).not.toBeNull()
      expect(result?.homeTeam).toBe('Ajax')
      expect(result?.pReal).toBe(0.72)
    })
  })
})
