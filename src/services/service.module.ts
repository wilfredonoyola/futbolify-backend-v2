import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServiceService } from './service.service';
import { ServiceResolver } from './service.resolver';
import { Service, ServiceSchema } from './schemas/service.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Service.name, schema: ServiceSchema }]),
  ],
  providers: [ServiceService, ServiceResolver],
  exports: [ServiceService],
})
export class ServiceModule {}
