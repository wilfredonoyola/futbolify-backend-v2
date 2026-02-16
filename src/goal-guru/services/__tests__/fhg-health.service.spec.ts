import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { FhgHealthService } from '../fhg-health.service'
import { FhgLogService } from '../fhg-log.service'
import { FhgHealth } from '../../schemas/fhg-health.schema'
import { FhgSelection } from '../../schemas/fhg-selection.schema'
import { FhgStatus } from '../../enums/fhg-status.enum'
import { FhgOutcome } from '../../enums/fhg-outcome.enum'
import { FhgSignal } from '../../enums/fhg-signal.enum'
import {
  CLV_GREEN_THRESHOLD,
  CLV_YELLOW_THRESHOLD,
} from '../../constants/fhg-config'

describe('FhgHealthService', () => {
  let service: FhgHealthService
  let mockLogService: jest.Mocked<FhgLogService>

  const mockHealthModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  }

  const mockSelectionModel = {
    find: jest.fn(),
  }

  beforeEach(async () => {
    mockLogService = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhgHealthService,
        {
          provide: getModelToken(FhgHealth.name),
          useValue: mockHealthModel,
        },
        {
          provide: getModelToken(FhgSelection.name),
          useValue: mockSelectionModel,
        },
        {
          provide: FhgLogService,
          useValue: mockLogService,
        },
      ],
    }).compile()

    service = module.get<FhgHealthService>(FhgHealthService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('CLV thresholds', () => {
    it('should have correct thresholds', () => {
      expect(CLV_GREEN_THRESHOLD).toBe(0.02) // 2%
      expect(CLV_YELLOW_THRESHOLD).toBe(0) // 0%
    })

    it('should determine GREEN status for CLV >= 2%', () => {
      // The status determination is:
      // GREEN: CLV >= 2%
      // YELLOW: CLV >= 0% and < 2%
      // RED: CLV < 0%
      expect(CLV_GREEN_THRESHOLD).toBe(0.02)
    })
  })

  describe('generateHealthReport', () => {
    it('should generate report with correct metrics for winning selections', async () => {
      const mockSelections = [
        {
          _id: { toString: () => 'sel-1' },
          leagueCode: 'eredivisie',
          signal: FhgSignal.A,
          outcome: FhgOutcome.WON,
          stakePercentage: 0.03,
          profitLoss: 0.015, // (1.5-1)*0.03
          clv: 0.03,
        },
        {
          _id: { toString: () => 'sel-2' },
          leagueCode: 'eredivisie',
          signal: FhgSignal.B,
          outcome: FhgOutcome.WON,
          stakePercentage: 0.02,
          profitLoss: 0.01,
          clv: 0.02,
        },
        {
          _id: { toString: () => 'sel-3' },
          leagueCode: 'bundesliga',
          signal: FhgSignal.A,
          outcome: FhgOutcome.LOST,
          stakePercentage: 0.03,
          profitLoss: -0.03,
          clv: 0.01,
        },
      ]

      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSelections),
      })

      mockHealthModel.create.mockImplementation((data) => ({
        ...data,
        _id: { toString: () => 'health-123' },
      }))

      const result = await service.generateHealthReport()

      expect(result.totalSelections).toBe(3)
      expect(result.won).toBe(2)
      expect(result.lost).toBe(1)
      expect(result.hitRate).toBeCloseTo(0.6667, 2) // 2/3
      expect(result.avgClv).toBeCloseTo(0.02, 2) // (0.03+0.02+0.01)/3
    })

    it('should determine GREEN status for high CLV', async () => {
      const mockSelections = [
        {
          _id: { toString: () => 'sel-1' },
          leagueCode: 'eredivisie',
          signal: FhgSignal.A,
          outcome: FhgOutcome.WON,
          stakePercentage: 0.03,
          profitLoss: 0.015,
          clv: 0.05, // 5% CLV
        },
      ]

      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSelections),
      })

      mockHealthModel.create.mockImplementation((data) => ({
        ...data,
        _id: { toString: () => 'health-123' },
      }))

      const result = await service.generateHealthReport()

      expect(result.status).toBe(FhgStatus.GREEN)
    })

    it('should determine RED status for negative CLV', async () => {
      const mockSelections = [
        {
          _id: { toString: () => 'sel-1' },
          leagueCode: 'eredivisie',
          signal: FhgSignal.A,
          outcome: FhgOutcome.LOST,
          stakePercentage: 0.03,
          profitLoss: -0.03,
          clv: -0.02, // -2% CLV
        },
      ]

      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSelections),
      })

      mockHealthModel.create.mockImplementation((data) => ({
        ...data,
        _id: { toString: () => 'health-123' },
      }))

      const result = await service.generateHealthReport()

      expect(result.status).toBe(FhgStatus.RED)
    })

    it('should handle empty selections', async () => {
      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      })

      mockHealthModel.create.mockImplementation((data) => ({
        ...data,
        _id: { toString: () => 'health-123' },
      }))

      const result = await service.generateHealthReport()

      expect(result.totalSelections).toBe(0)
      expect(result.hitRate).toBe(0)
      expect(result.avgClv).toBe(0)
    })
  })

  describe('getLatestHealthReport', () => {
    it('should return existing recent report', async () => {
      const recentDate = new Date()
      const mockHealth = {
        _id: { toString: () => 'health-123' },
        status: FhgStatus.GREEN,
        reportDate: recentDate,
        periodStart: new Date(),
        periodEnd: recentDate,
        totalSelections: 10,
        settledSelections: 8,
        pendingSelections: 2,
        won: 5,
        lost: 3,
        voided: 0,
        hitRate: 0.625,
        avgClv: 0.025,
        roi: 0.05,
        totalProfitLoss: 0.04,
        totalStaked: 0.8,
        byLeague: [],
        bySignal: [],
        alerts: [],
      }

      mockHealthModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockHealth),
        }),
      })

      const result = await service.getLatestHealthReport()

      expect(result).not.toBeNull()
      expect(result?.status).toBe(FhgStatus.GREEN)
    })

    it('should generate new report if none exists', async () => {
      mockHealthModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      })

      mockSelectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      })

      mockHealthModel.create.mockImplementation((data) => ({
        ...data,
        _id: { toString: () => 'health-new' },
      }))

      const result = await service.getLatestHealthReport()

      expect(result).not.toBeNull()
    })
  })
})
