import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from './schemas/company.schema';
import { CompanyOutput, CreateCompanyInput, UpdateCompanyInput } from './dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
  ) {}

  async create(createCompanyInput: CreateCompanyInput): Promise<CompanyOutput> {
    const companyData = {
      ...createCompanyInput,
      _id: createCompanyInput.companyId
        ? createCompanyInput.companyId
        : undefined,
    };

    const createdCompany = new this.companyModel(companyData);
    const savedCompany = await createdCompany.save();

    return this.toCompanyOutput(savedCompany);
  }

  async findAll(): Promise<CompanyOutput[]> {
    const companies = await this.companyModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
    return companies.map((company) => this.toCompanyOutput(company));
  }

  async findOne(companyId: string): Promise<CompanyOutput> {
    const company = await this.companyModel.findById(companyId).exec();
    return this.toCompanyOutput(company);
  }

  async update(
    companyId: string,
    updateCompanyInput: UpdateCompanyInput,
  ): Promise<CompanyOutput> {
    const updatedCompany = await this.companyModel
      .findByIdAndUpdate(companyId, updateCompanyInput, { new: true })
      .exec();
    return this.toCompanyOutput(updatedCompany);
  }

  async remove(companyId: string): Promise<CompanyOutput> {
    const removedCompany = await this.companyModel
      .findByIdAndDelete(companyId)
      .exec();
    return this.toCompanyOutput(removedCompany);
  }

  private toCompanyOutput(company: Company): CompanyOutput {
    return {
      companyId: company._id.toString(),
      name: company.name,
      address: company.address,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }

  // Método para añadir un usuario a la lista de miembros
  async addMember(companyId: string, userId: string): Promise<Company> {
    return this.companyModel
      .findByIdAndUpdate(
        companyId,
        { $addToSet: { members: userId } }, // Agregar el usuario al array de miembros
        { new: true },
      )
      .exec();
  }
}
