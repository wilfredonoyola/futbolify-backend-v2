import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule } from '@nestjs/config'

import {
  BettingPick,
  BettingPickSchema,
  BettingCombo,
  BettingComboSchema,
  BettingDailySummary,
  BettingDailySummarySchema,
  BettingSettings,
  BettingSettingsSchema,
  BettingLeague,
  BettingLeagueSchema,
} from '../schemas'

import { BettingTelegramService } from './betting-telegram.service'
import { BettingTelegramGuard } from './betting-telegram.guards'
import { BettingTelegramFormatters } from './betting-telegram.formatters'
import { BettingTelegramCommands } from './betting-telegram.commands'
import { BettingTelegramCallbacks } from './betting-telegram.callbacks'

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: BettingPick.name, schema: BettingPickSchema },
      { name: BettingCombo.name, schema: BettingComboSchema },
      { name: BettingDailySummary.name, schema: BettingDailySummarySchema },
      { name: BettingSettings.name, schema: BettingSettingsSchema },
      { name: BettingLeague.name, schema: BettingLeagueSchema },
    ]),
  ],
  providers: [
    BettingTelegramGuard,
    BettingTelegramFormatters,
    BettingTelegramCommands,
    BettingTelegramCallbacks,
    BettingTelegramService,
  ],
  exports: [BettingTelegramService],
})
export class BettingTelegramModule {}
