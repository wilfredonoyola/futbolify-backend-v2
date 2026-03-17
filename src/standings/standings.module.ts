import { Module } from '@nestjs/common';
import { StandingsResolver } from './standings.resolver';
import { StandingsService } from './standings.service';

@Module({
  providers: [StandingsResolver, StandingsService],
  exports: [StandingsService],
})
export class StandingsModule {}
