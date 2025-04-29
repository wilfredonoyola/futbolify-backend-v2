import { ObjectType, Field, Int, Float } from '@nestjs/graphql'

@ObjectType()
export class LiveMatchForGptDto {
  @Field(() => Int)
  id: number

  @Field()
  homeTeam: string

  @Field()
  awayTeam: string

  @Field(() => Int, { nullable: true })
  minute?: number

  @Field(() => Int)
  scoreHome: number

  @Field(() => Int)
  scoreAway: number

  @Field(() => Int)
  shots: number // ✅ Remates totales

  @Field(() => Int)
  shotsOnTarget: number // ✅ Remates a puerta

  @Field(() => Int)
  dangerousAttacks: number // ✅ Ataques peligrosos

  @Field(() => Int)
  corners: number // ✅ Córners totales

  @Field(() => Float, { nullable: true }) // 🛠️ Ahora acepta null
  pressureScore?: number

  @Field(() => Boolean, { nullable: true })
  isGoodForOver05?: boolean // ✅ Análisis automático sugerido para Over 0.5

  @Field(() => Boolean, { nullable: true })
  isGoodForOver15?: boolean // ✅ Análisis automático sugerido para Over 1.5

  @Field(() => Boolean, { nullable: true })
  marketAvailable?: boolean // 🔵 Opcional: Confirmación mercado Bet365 activo
}
