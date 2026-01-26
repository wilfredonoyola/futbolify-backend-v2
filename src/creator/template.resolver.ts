import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Template } from './schemas/template.schema';
import { TemplateService } from './template.service';
import { CreateTemplateInput } from './dto/create-template.input';
import { UpdateTemplateInput } from './dto/update-template.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Template)
@UseGuards(GqlAuthGuard)
export class TemplateResolver {
  constructor(private readonly templateService: TemplateService) {}

  @Mutation(() => Template)
  async createTemplate(
    @CurrentUser() user: any,
    @Args('input') createTemplateInput: CreateTemplateInput,
  ): Promise<Template> {
    return this.templateService.create(user.userId, createTemplateInput);
  }

  @Query(() => [Template])
  async myTemplates(
    @CurrentUser() user: any,
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findAllByUser(user.userId, category);
  }

  @Query(() => [Template])
  async brandTemplates(
    @CurrentUser() user: any,
    @Args('brandId', { type: () => ID }) brandId: string,
  ): Promise<Template[]> {
    return this.templateService.findByBrand(user.userId, brandId);
  }

  @Query(() => [Template])
  async presetTemplates(
    @Args('category', { nullable: true }) category?: string,
  ): Promise<Template[]> {
    return this.templateService.findPresets(category);
  }

  @Query(() => Template)
  async template(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Template> {
    return this.templateService.findOne(id, user.userId);
  }

  @Query(() => Template, { nullable: true })
  async templateByPresetId(
    @Args('presetId') presetId: string,
  ): Promise<Template | null> {
    return this.templateService.findByPresetId(presetId);
  }

  @Mutation(() => Template)
  async updateTemplate(
    @CurrentUser() user: any,
    @Args('input') updateTemplateInput: UpdateTemplateInput,
  ): Promise<Template> {
    return this.templateService.update(user.userId, updateTemplateInput);
  }

  @Mutation(() => Template)
  async duplicateTemplate(
    @CurrentUser() user: any,
    @Args('templateId', { type: () => ID }) templateId: string,
    @Args('newName', { nullable: true }) newName?: string,
  ): Promise<Template> {
    return this.templateService.duplicate(user.userId, templateId, newName);
  }

  @Mutation(() => Boolean)
  async deleteTemplate(
    @CurrentUser() user: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.templateService.remove(id, user.userId);
  }

  @Query(() => [Template])
  async searchTemplates(
    @CurrentUser() user: any,
    @Args('query') query: string,
  ): Promise<Template[]> {
    return this.templateService.search(user.userId, query);
  }
}
