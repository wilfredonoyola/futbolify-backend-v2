import { registerEnumType } from '@nestjs/graphql';

export enum TimeRange {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

registerEnumType(TimeRange, {
  name: 'TimeRange',
});
