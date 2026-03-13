import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuinielaResolver } from './quiniela.resolver';
import { QuinielaService } from './quiniela.service';
import { QuinielaAIService } from './quiniela-ai.service';
import { Quiniela, QuinielaSchema } from './schemas/quiniela.schema';
import { AIPredictionDoc, AIPredictionSchema } from './schemas/ai-prediction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiniela.name, schema: QuinielaSchema },
      { name: AIPredictionDoc.name, schema: AIPredictionSchema },
    ]),
  ],
  providers: [QuinielaService, QuinielaAIService, QuinielaResolver],
  exports: [QuinielaService, QuinielaAIService],
})
export class QuinielaModule {}
