import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QuinielaResolver } from './quiniela.resolver';
import { QuinielaService } from './quiniela.service';
import { Quiniela, QuinielaSchema } from './schemas/quiniela.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quiniela.name, schema: QuinielaSchema },
    ]),
  ],
  providers: [QuinielaService, QuinielaResolver],
  exports: [QuinielaService],
})
export class QuinielaModule {}
