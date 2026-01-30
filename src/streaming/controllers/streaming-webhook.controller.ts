import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { StreamService } from '../services/stream.service'
import { ChatService } from '../services/chat.service'

interface NginxRtmpEvent {
  call?: string
  addr?: string
  clientid?: string
  app?: string
  name?: string
  flashver?: string
  swfurl?: string
  tcurl?: string
  pageurl?: string
  type?: string
}

@Controller('api/streaming')
export class StreamingWebhookController {
  private readonly logger = new Logger(StreamingWebhookController.name)

  constructor(
    private readonly streamService: StreamService,
    private readonly chatService: ChatService,
  ) {}

  @Post('on-publish')
  @HttpCode(HttpStatus.OK)
  async onPublish(@Body() body: NginxRtmpEvent): Promise<{ success: boolean }> {
    this.logger.log(`on-publish event received: ${JSON.stringify(body)}`)

    const streamKey = body.name
    if (!streamKey) {
      this.logger.warn('No stream key provided in on-publish event')
      throw new UnauthorizedException('Invalid stream key')
    }

    const stream = await this.streamService.validateStreamKey(streamKey)
    if (!stream) {
      this.logger.warn(`Invalid stream key: ${streamKey}`)
      throw new UnauthorizedException('Invalid stream key')
    }

    await this.streamService.startStreamByKey(streamKey)
    this.logger.log(`Stream started successfully: ${stream._id}`)

    await this.chatService.sendSystemMessage(
      stream._id.toString(),
      'Stream has started!',
    )

    return { success: true }
  }

  @Post('on-publish-done')
  @HttpCode(HttpStatus.OK)
  async onPublishDone(
    @Body() body: NginxRtmpEvent,
  ): Promise<{ success: boolean }> {
    this.logger.log(`on-publish-done event received: ${JSON.stringify(body)}`)

    const streamKey = body.name
    if (!streamKey) {
      return { success: false }
    }

    const stream = await this.streamService.endStreamByKey(streamKey)
    if (stream) {
      this.logger.log(`Stream ended: ${stream._id}`)

      await this.chatService.sendSystemMessage(
        stream._id.toString(),
        'Stream has ended. Thanks for watching!',
      )
    }

    return { success: true }
  }

  @Post('on-play')
  @HttpCode(HttpStatus.OK)
  async onPlay(@Body() body: NginxRtmpEvent): Promise<{ success: boolean }> {
    this.logger.log(`on-play event received: ${JSON.stringify(body)}`)

    const streamKey = body.name
    if (!streamKey) {
      throw new UnauthorizedException('Invalid stream key')
    }

    const stream = await this.streamService.validateStreamKey(streamKey)
    if (!stream) {
      this.logger.warn(`Invalid stream key for play: ${streamKey}`)
      throw new UnauthorizedException('Stream not found')
    }

    if (stream.status !== 'LIVE') {
      this.logger.warn(`Attempted to play non-live stream: ${stream._id}`)
      throw new UnauthorizedException('Stream is not live')
    }

    return { success: true }
  }

  @Post('on-play-done')
  @HttpCode(HttpStatus.OK)
  async onPlayDone(@Body() body: NginxRtmpEvent): Promise<{ success: boolean }> {
    this.logger.log(`on-play-done event received: ${JSON.stringify(body)}`)
    return { success: true }
  }
}
