import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { CompanyService } from './company.service';
import { Company } from './schemas/company.schema';
import { CompanyOutput, CreateCompanyInput, UpdateCompanyInput } from './dto';

@Resolver(() => Company)
export class CompanyResolver {
  constructor(private readonly companyService: CompanyService) {}

  @Mutation(() => CompanyOutput)
  createCompany(
    @Args('createCompanyInput') createCompanyInput: CreateCompanyInput,
  ) {
    return this.companyService.create(createCompanyInput);
  }

  @Query(() => [CompanyOutput], { name: 'companies' })
  findAll() {
    return this.companyService.findAll();
  }

  @Query(() => CompanyOutput, { name: 'company' })
  findOne(@Args('companyId') companyId: string) {
    return this.companyService.findOne(companyId);
  }

  @Mutation(() => CompanyOutput)
  updateCompany(
    @Args('companyId') companyId: string,
    @Args('updateCompanyInput') updateCompanyInput: UpdateCompanyInput,
  ) {
    return this.companyService.update(companyId, updateCompanyInput);
  }

  @Mutation(() => CompanyOutput)
  removeCompany(@Args('companyId') companyId: string) {
    return this.companyService.remove(companyId);
  }
}
