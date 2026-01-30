import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { StreamService } from './stream.service'
import { Stream, StreamStatus } from '../schemas/stream.schema'
import { StreamAnalytics } from '../schemas/stream-analytics.schema'
import { PUB_SUB } from '../providers/pubsub.provider'

describe('StreamService', () => {
  let service: StreamService
  let mockStreamModel: any
  let mockAnalyticsModel: any
  let mockPubSub: any

  beforeEach(async () => {
    mockStreamModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      findOne: jest.fn(),
    }

    mockAnalyticsModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
    }

    mockPubSub = {
      publish: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamService,
        { provide: getModelToken(Stream.name), useValue: mockStreamModel },
        { provide: getModelToken(StreamAnalytics.name), useValue: mockAnalyticsModel },
        { provide: PUB_SUB, useValue: mockPubSub },
      ],
    }).compile()

    service = module.get<StreamService>(StreamService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('createStream', () => {
    it('should create a stream with streamKey', async () => {
      const input = { title: 'Test Stream' }
      const userId = '507f1f77bcf86cd799439011' // Valid ObjectId format
      const mockCreatedStream = {
        _id: '507f1f77bcf86cd799439012',
        ...input,
        userId,
        streamKey: expect.any(String),
        status: StreamStatus.SCHEDULED,
      }

      mockStreamModel.create.mockResolvedValue(mockCreatedStream)
      mockAnalyticsModel.create.mockResolvedValue({})

      const result = await service.createStream(userId, input as any)

      expect(mockStreamModel.create).toHaveBeenCalled()
      expect(mockAnalyticsModel.create).toHaveBeenCalled()
      expect(result.title).toBe('Test Stream')
    })
  })

  describe('getStream', () => {
    it('should return a stream by id', async () => {
      const mockStream = { _id: 'stream123', title: 'Test Stream' }
      mockStreamModel.findById.mockResolvedValue(mockStream)

      const result = await service.getStream('stream123')

      expect(result).toEqual(mockStream)
      expect(mockStreamModel.findById).toHaveBeenCalledWith('stream123')
    })

    it('should throw NotFoundException if stream not found', async () => {
      mockStreamModel.findById.mockResolvedValue(null)

      await expect(service.getStream('nonexistent')).rejects.toThrow(
        'Stream not found',
      )
    })
  })

  describe('getLiveStreams', () => {
    it('should return live streams sorted by viewer count', async () => {
      const mockStreams = [
        { _id: '1', viewerCount: 100 },
        { _id: '2', viewerCount: 50 },
      ]

      mockStreamModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockStreams),
      })

      const result = await service.getLiveStreams()

      expect(result).toEqual(mockStreams)
      expect(mockStreamModel.find).toHaveBeenCalledWith({
        status: StreamStatus.LIVE,
      })
    })
  })

  describe('joinStream', () => {
    it('should increment viewer count and publish event', async () => {
      const mockStream = {
        _id: 'stream123',
        viewerCount: 10,
      }

      mockStreamModel.findByIdAndUpdate.mockResolvedValue(mockStream)
      mockAnalyticsModel.findOneAndUpdate.mockResolvedValue({})

      const result = await service.joinStream('stream123', 'user123')

      expect(result.viewerCount).toBe(10)
      expect(mockPubSub.publish).toHaveBeenCalled()
    })
  })

  describe('validateStreamKey', () => {
    it('should return stream if streamKey is valid', async () => {
      const mockStream = { _id: 'stream123', streamKey: 'key123' }
      mockStreamModel.findOne.mockResolvedValue(mockStream)

      const result = await service.validateStreamKey('key123')

      expect(result).toEqual(mockStream)
      expect(mockStreamModel.findOne).toHaveBeenCalledWith({
        streamKey: 'key123',
      })
    })

    it('should return null if streamKey is invalid', async () => {
      mockStreamModel.findOne.mockResolvedValue(null)

      const result = await service.validateStreamKey('invalid')

      expect(result).toBeNull()
    })
  })
})
