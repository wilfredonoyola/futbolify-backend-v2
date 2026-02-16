import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FhgValueService } from '../fhg-value.service'
import { FhgLogService } from '../fhg-log.service'
import { FhgPrediction } from '../../schemas/fhg-prediction.schema'
import { FhgOdds } from '../../schemas/fhg-odds.schema'
import { FhgSignal } from '../../enums/fhg-signal.enum'
import {
  SIGNAL_A_THRESHOLD,
  SIGNAL_B_THRESHOLD,
  STAKE_SIGNAL_A,
  STAKE_SIGNAL_B,
  STAKE_SIGNAL_C,
} from '../../constants/fhg-config'

describe('FhgValueService', () => {
  let service: FhgValueService
  let mockLogService: jest.Mocked<FhgLogService>

  const mockPredictionModel = {
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  }

  const mockOddsModel = {
    findById: jest.fn(),
  }

  beforeEach(async () => {
    mockLogService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logValue: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhgValueService,
        {
          provide: getModelToken(FhgPrediction.name),
          useValue: mockPredictionModel,
        },
        {
          provide: getModelToken(FhgOdds.name),
          useValue: mockOddsModel,
        },
        {
          provide: FhgLogService,
          useValue: mockLogService,
        },
      ],
    }).compile()

    service = module.get<FhgValueService>(FhgValueService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('calculateSignal', () => {
    it('should return Signal A for margin >= 8%', () => {
      expect(service.calculateSignal(0.08)).toBe(FhgSignal.A)
      expect(service.calculateSignal(0.10)).toBe(FhgSignal.A)
      expect(service.calculateSignal(0.15)).toBe(FhgSignal.A)
    })

    it('should return Signal B for margin 3-8%', () => {
      expect(service.calculateSignal(0.03)).toBe(FhgSignal.B)
      expect(service.calculateSignal(0.05)).toBe(FhgSignal.B)
      expect(service.calculateSignal(0.079)).toBe(FhgSignal.B)
    })

    it('should return Signal C for margin 0-3%', () => {
      expect(service.calculateSignal(0)).toBe(FhgSignal.C)
      expect(service.calculateSignal(0.01)).toBe(FhgSignal.C)
      expect(service.calculateSignal(0.029)).toBe(FhgSignal.C)
    })

    it('should return Signal NONE for negative margin', () => {
      expect(service.calculateSignal(-0.01)).toBe(FhgSignal.NONE)
      expect(service.calculateSignal(-0.05)).toBe(FhgSignal.NONE)
      expect(service.calculateSignal(-0.10)).toBe(FhgSignal.NONE)
    })
  })

  describe('calculateStake', () => {
    it('should return correct stake for Signal A', () => {
      const stake = service.calculateStake(FhgSignal.A, 50)
      expect(stake).toBeCloseTo(STAKE_SIGNAL_A, 4)
    })

    it('should return correct stake for Signal B', () => {
      const stake = service.calculateStake(FhgSignal.B, 50)
      expect(stake).toBeCloseTo(STAKE_SIGNAL_B, 4)
    })

    it('should return correct stake for Signal C', () => {
      const stake = service.calculateStake(FhgSignal.C, 50)
      expect(stake).toBeCloseTo(STAKE_SIGNAL_C, 4)
    })

    it('should return 0 for Signal NONE', () => {
      expect(service.calculateStake(FhgSignal.NONE, 50)).toBe(0)
    })

    it('should adjust stake based on edge score (high edge)', () => {
      const baseStake = STAKE_SIGNAL_A
      const highEdgeStake = service.calculateStake(FhgSignal.A, 80)
      // High edge score should increase stake (up to 20%)
      expect(highEdgeStake).toBeGreaterThan(baseStake)
      expect(highEdgeStake).toBeLessThanOrEqual(baseStake * 1.2)
    })

    it('should adjust stake based on edge score (low edge)', () => {
      const baseStake = STAKE_SIGNAL_A
      const lowEdgeStake = service.calculateStake(FhgSignal.A, 20)
      // Low edge score should decrease stake (up to 20%)
      expect(lowEdgeStake).toBeLessThan(baseStake)
      expect(lowEdgeStake).toBeGreaterThanOrEqual(baseStake * 0.8)
    })
  })

  describe('evaluateValue', () => {
    it('should return null when prediction not found', async () => {
      mockPredictionModel.findById.mockResolvedValue(null)

      const result = await service.evaluateValue('pred-123', 'odds-123')

      expect(result).toBeNull()
      expect(mockLogService.warn).toHaveBeenCalled()
    })

    it('should return null when odds not found', async () => {
      mockPredictionModel.findById.mockResolvedValue({
        _id: 'pred-123',
        matchId: { toString: () => 'match-123' },
        pReal: 0.70,
      })
      mockOddsModel.findById.mockResolvedValue(null)

      const result = await service.evaluateValue('pred-123', 'odds-123')

      expect(result).toBeNull()
      expect(mockLogService.warn).toHaveBeenCalled()
    })

    it('should calculate value correctly for a valid candidate', async () => {
      const pReal = 0.75
      const odds = 1.50

      mockPredictionModel.findById.mockResolvedValue({
        _id: 'pred-123',
        matchId: { toString: () => 'match-123' },
        pReal,
        edgeScore: 65,
        edgeBreakdown: {},
      })
      mockOddsModel.findById.mockResolvedValue({
        _id: 'odds-123',
        matchId: { toString: () => 'match-123' },
        bestG1hYes: odds,
        bestG1hYesBookmaker: 'bet365',
      })

      const result = await service.evaluateValue('pred-123', 'odds-123')

      expect(result).not.toBeNull()
      expect(result?.pReal).toBe(pReal)
      expect(result?.bestOdds).toBe(odds)
      // marginValor = (1.50 * 0.75) - 1 = 0.125 = 12.5%
      expect(result?.marginValor).toBeCloseTo(0.125, 4)
      expect(result?.signal).toBe(FhgSignal.A) // 12.5% > 8%
      expect(result?.isCandidate).toBe(true)
    })

    it('should reject candidate with no value (negative margin)', async () => {
      const pReal = 0.50
      const odds = 1.80

      mockPredictionModel.findById.mockResolvedValue({
        _id: 'pred-123',
        matchId: { toString: () => 'match-123' },
        pReal,
        edgeScore: 65,
        edgeBreakdown: {},
      })
      mockOddsModel.findById.mockResolvedValue({
        _id: 'odds-123',
        matchId: { toString: () => 'match-123' },
        bestG1hYes: odds,
        bestG1hYesBookmaker: 'bet365',
      })

      const result = await service.evaluateValue('pred-123', 'odds-123')

      expect(result).not.toBeNull()
      // marginValor = (1.80 * 0.50) - 1 = -0.10 = -10%
      expect(result?.marginValor).toBeCloseTo(-0.10, 4)
      expect(result?.signal).toBe(FhgSignal.NONE)
      expect(result?.isCandidate).toBe(false)
    })
  })
})
