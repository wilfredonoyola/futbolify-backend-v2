import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Service } from './schemas/service.schema';
import { CreateServiceInput, ServiceOutput, UpdateServiceInput } from './dto';
import { Category } from 'src/category/schemas/category.schema';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';

@Injectable()
export class ServiceService {
  constructor(
    @InjectModel(Service.name) private serviceModel: Model<ServiceOutput>,
  ) {}

  async create(
    createServiceInput: CreateServiceInput,
    user: CurrentUserPayload,
  ): Promise<ServiceOutput> {
    const createdService = new this.serviceModel({
      ...createServiceInput,
      ...(createServiceInput.categoryId
        ? { category: new Types.ObjectId(createServiceInput.categoryId) }
        : null),
      company: user.company._id, // Asociamos la empresa del usuario logueado
      createdBy: new Types.ObjectId(user.id), // Asociamos el usuario que lo crea
    });

    const savedService = await createdService.save();

    const populatedService = (await this.serviceModel
      .findById(savedService._id)
      .populate('category')
      .exec()) as Service & { category: Category };

    return this.toServiceOutput(populatedService);
  }

  async findAll(user: CurrentUserPayload): Promise<ServiceOutput[]> {
    let services;
    if (user.roles.includes('SUPER_ADMIN')) {
      // Si es SUPER_ADMIN, puede ver todos los servicios
      services = await this.serviceModel
        .find()
        .populate({
          path: 'category',
          select: 'categoryId name description createdAt updatedAt',
        })
        .sort({ createdAt: -1 })
        .exec();
    } else {
      // Si no es SUPER_ADMIN, solo puede ver los servicios de su empresa
      services = await this.serviceModel
        .find({ company: user.company._id })
        .populate({
          path: 'category',
          select: 'categoryId name description createdAt updatedAt',
        })
        .sort({ createdAt: -1 })
        .exec();
    }

    return services.map((service) =>
      this.toServiceOutput(service as Service & { category: Category }),
    );
  }

  async findOne(
    serviceId: string,
    user: CurrentUserPayload,
  ): Promise<ServiceOutput> {
    let service;

    if (user.roles.includes('SUPER_ADMIN')) {
      // Si es SUPER_ADMIN, puede ver cualquier servicio
      service = await this.serviceModel
        .findById(serviceId)
        .populate('category')
        .exec();
    } else {
      // Si no es SUPER_ADMIN, solo puede ver los servicios de su empresa
      service = await this.serviceModel
        .findOne({ _id: serviceId, company: user.company._id })
        .populate('category')
        .exec();
    }

    if (!service) {
      throw new Error('Service not found');
    }

    return this.toServiceOutput(service as Service & { category: Category });
  }

  async update(
    serviceId: string,
    updateServiceInput: UpdateServiceInput,
    user: CurrentUserPayload,
  ): Promise<ServiceOutput> {
    const { categoryId, ...rest } = updateServiceInput;
    const updateData: Partial<Service> = {
      ...rest,
    };

    if (categoryId) {
      updateData.category = new Types.ObjectId(categoryId);
    } else {
      updateData.category = undefined;
    }

    let updatedService;

    if (user.roles.includes('SUPER_ADMIN')) {
      // SUPER_ADMIN no puede actualizar servicios
      throw new Error('SUPER_ADMIN cannot update services');
    } else {
      // Solo ADMIN o USER pueden actualizar servicios de su empresa
      updatedService = await this.serviceModel
        .findOneAndUpdate(
          { _id: serviceId, company: user.company._id }, // Filtrar por empresa y servicio
          updateData,
          { new: true },
        )
        .populate('category')
        .exec();
    }

    if (!updatedService) {
      throw new Error('Service not found');
    }

    return this.toServiceOutput(
      updatedService as Service & { category: Category },
    );
  }

  async remove(
    serviceId: string,
    user: CurrentUserPayload,
  ): Promise<ServiceOutput> {
    let removedService;

    if (user.roles.includes('SUPER_ADMIN')) {
      // SUPER_ADMIN no puede eliminar servicios
      throw new Error('SUPER_ADMIN cannot remove services');
    } else {
      // Solo ADMIN o USER pueden eliminar servicios de su empresa
      removedService = await this.serviceModel
        .findOneAndDelete({ _id: serviceId, company: user.company._id })
        .populate('category')
        .exec();
    }

    if (!removedService) {
      throw new Error('Service not found');
    }

    return this.toServiceOutput(
      removedService as Service & { category: Category },
    );
  }

  private toServiceOutput(
    service: Service & { category: Category },
  ): ServiceOutput {
    return {
      serviceId: service._id.toString(),
      name: service.name,
      description: service.description,
      price: service.price,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      category: service.category
        ? {
            categoryId: service.category._id.toString(),
            name: service.category.name,
            description: service.category.description,
            createdAt: service.category.createdAt,
            updatedAt: service.category.updatedAt,
          }
        : null,
    };
  }
}
