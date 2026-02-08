import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FrasesService } from './frases.service';
import { FrasesAiService } from './frases-ai.service';
import { FrasesResolver } from './frases.resolver';
import { Frase, FraseSchema } from './schemas/frase.schema';
import { BunnyModule } from '../bunny/bunny.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Frase.name, schema: FraseSchema }]),
    BunnyModule, // Para futura funcionalidad de guardar exports en CDN
  ],
  providers: [FrasesService, FrasesAiService, FrasesResolver],
  exports: [FrasesService],
})
export class FrasesModule {}
