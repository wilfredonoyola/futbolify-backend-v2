import { Injectable } from '@nestjs/common';
import { MatchOutputDto } from './dto';
import { MatchStatusEnum } from './enums/match-status.enum';

@Injectable()
export class MatchesService {
  private readonly matches: MatchOutputDto[] = [
    {
      id: 1,
      homeTeam: 'Manchester United',
      awayTeam: 'Arsenal',
      minute: 72,
      scoreHome: 1,
      scoreAway: 0,
      shots: 14,
      shotsOnTarget: 6,
      dangerousAttacks: 65,
      corners: 5,
      status: MatchStatusEnum.LIVE,
    },
    {
      id: 2,
      homeTeam: 'Barcelona',
      awayTeam: 'Real Madrid',
      scoreHome: 0,
      scoreAway: 0,
      status: MatchStatusEnum.SCHEDULED,
    },
    {
      id: 3,
      homeTeam: 'Bayern',
      awayTeam: 'Dortmund',
      scoreHome: 3,
      scoreAway: 2,
      status: MatchStatusEnum.FINISHED,
    },
  ];

  getLiveMatches(): MatchOutputDto[] {
    return this.matches.filter(match => match.status === MatchStatusEnum.LIVE);
  }
}
