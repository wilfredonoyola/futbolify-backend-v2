import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { FrasesService } from './frases.service';
import { FrasesAiService } from './frases-ai.service';
import { Frase, FraseCategory } from './schemas/frase.schema';
import {
  GenerateFraseInput,
  SaveFraseInput,
  FilterFrasesInput,
  GenerateResponse,
} from './dto/frases.dto';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => Frase)
export class FrasesResolver {
  constructor(
    private readonly frasesService: FrasesService,
    private readonly aiService: FrasesAiService,
  ) {}

  // ========== MUTATIONS ==========

  @Mutation(() => GenerateResponse, {
    description: 'Generar frases con IA (requiere autenticación)',
  })
  @UseGuards(GqlAuthGuard)
  async generateFrases(
    @Args('input') input: GenerateFraseInput,
  ): Promise<GenerateResponse> {
    const frases = await this.aiService.generateFrases(input);
    return { frases };
  }

  @Mutation(() => Frase, {
    description: 'Guardar una frase generada',
  })
  @UseGuards(GqlAuthGuard)
  async saveFrase(
    @Args('input') input: SaveFraseInput,
    @CurrentUser() user: any,
  ): Promise<Frase> {
    return this.frasesService.save(input, user.id);
  }

  @Mutation(() => Frase, {
    description: 'Dar like a una frase',
  })
  async toggleLike(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Frase> {
    return this.frasesService.toggleLike(id);
  }

  @Mutation(() => Frase, {
    description: 'Cambiar visibilidad pública/privada de una frase',
  })
  @UseGuards(GqlAuthGuard)
  async togglePublic(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: any,
  ): Promise<Frase> {
    return this.frasesService.togglePublic(id, user.id);
  }

  @Mutation(() => Boolean, {
    description: 'Eliminar una frase',
  })
  @UseGuards(GqlAuthGuard)
  async deleteFrase(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: any,
  ): Promise<boolean> {
    return this.frasesService.delete(id, user.id);
  }

  @Mutation(() => Frase, {
    description: 'Actualizar URL de imagen exportada',
  })
  @UseGuards(GqlAuthGuard)
  async updateExportedImage(
    @Args('id', { type: () => ID }) id: string,
    @Args('imageUrl') imageUrl: string,
    @CurrentUser() user: any,
  ): Promise<Frase> {
    return this.frasesService.updateExportedImage(id, user.id, imageUrl);
  }

  // ========== QUERIES ==========

  @Query(() => [Frase], {
    description: 'Obtener frases con filtros',
  })
  async frases(
    @Args('filter', { nullable: true }) filter?: FilterFrasesInput,
  ): Promise<Frase[]> {
    return this.frasesService.findAll(filter);
  }

  @Query(() => [Frase], {
    description: 'Obtener mis frases',
  })
  @UseGuards(GqlAuthGuard)
  async myFrases(
    @CurrentUser() user: any,
    @Args('filter', { nullable: true }) filter?: FilterFrasesInput,
  ): Promise<Frase[]> {
    return this.frasesService.findByUser(user.id, filter);
  }

  @Query(() => Frase, {
    description: 'Obtener una frase por ID',
  })
  async frase(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Frase> {
    return this.frasesService.findOne(id);
  }

  @Query(() => Frase, {
    description: 'Obtener una frase aleatoria',
  })
  async randomFrase(
    @Args('categoria', { type: () => FraseCategory, nullable: true }) categoria?: FraseCategory,
  ): Promise<Frase> {
    return this.frasesService.findRandom(categoria);
  }

  @Query(() => [Frase], {
    description: 'Obtener frases trending (más likes)',
  })
  async trendingFrases(
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<Frase[]> {
    return this.frasesService.findTrending(limit);
  }
}
