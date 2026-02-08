import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Frase, FraseDocument } from './schemas/frase.schema';
import { SaveFraseInput, FilterFrasesInput } from './dto/frases.dto';

@Injectable()
export class FrasesService {
  constructor(
    @InjectModel(Frase.name) private fraseModel: Model<FraseDocument>,
  ) {}

  async save(input: SaveFraseInput, userId: string): Promise<FraseDocument> {
    const frase = new this.fraseModel({
      ...input,
      userId,
      isPublic: false,
      likesCount: 0,
    });
    return frase.save();
  }

  async toggleLike(id: string): Promise<FraseDocument> {
    const frase = await this.fraseModel.findByIdAndUpdate(
      id,
      { $inc: { likesCount: 1 } },
      { new: true },
    );
    
    if (!frase) {
      throw new NotFoundException(`Frase with ID ${id} not found`);
    }
    
    return frase;
  }

  async togglePublic(id: string, userId: string): Promise<FraseDocument> {
    const frase = await this.fraseModel.findOne({ _id: id, userId });
    
    if (!frase) {
      throw new NotFoundException(`Frase with ID ${id} not found or not owned by user`);
    }
    
    frase.isPublic = !frase.isPublic;
    return frase.save();
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await this.fraseModel.findOneAndDelete({ _id: id, userId });
    return !!result;
  }

  async findAll(filter?: FilterFrasesInput): Promise<FraseDocument[]> {
    const query: any = {};

    if (filter?.categoria) {
      query.categoria = filter.categoria;
    }
    
    if (filter?.tono) {
      query.tono = filter.tono;
    }
    
    if (filter?.equipo) {
      query.equipo = { $regex: filter.equipo, $options: 'i' };
    }
    
    if (filter?.search) {
      query.$text = { $search: filter.search };
    }

    if (filter?.onlyPublic) {
      query.isPublic = true;
    }

    return this.fraseModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter?.limit ?? 20)
      .skip(filter?.offset ?? 0)
      .exec();
  }

  async findByUser(userId: string, filter?: FilterFrasesInput): Promise<FraseDocument[]> {
    const query: any = { userId };

    if (filter?.categoria) {
      query.categoria = filter.categoria;
    }
    
    if (filter?.tono) {
      query.tono = filter.tono;
    }

    return this.fraseModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter?.limit ?? 20)
      .skip(filter?.offset ?? 0)
      .exec();
  }

  async findOne(id: string): Promise<FraseDocument> {
    const frase = await this.fraseModel.findById(id).exec();
    
    if (!frase) {
      throw new NotFoundException(`Frase with ID ${id} not found`);
    }
    
    return frase;
  }

  async findRandom(categoria?: string): Promise<FraseDocument> {
    const match: any = categoria ? { categoria } : {};
    const [frase] = await this.fraseModel.aggregate([
      { $match: match },
      { $sample: { size: 1 } },
    ]);
    
    if (!frase) {
      throw new NotFoundException('No frases found');
    }
    
    return frase;
  }

  async findTrending(limit: number): Promise<FraseDocument[]> {
    return this.fraseModel
      .find({ isPublic: true })
      .sort({ likesCount: -1 })
      .limit(limit)
      .exec();
  }

  async updateExportedImage(id: string, userId: string, imageUrl: string): Promise<FraseDocument> {
    const frase = await this.fraseModel.findOne({ _id: id, userId });
    
    if (!frase) {
      throw new NotFoundException(`Frase with ID ${id} not found or not owned by user`);
    }
    
    frase.exportedImageUrl = imageUrl;
    return frase.save();
  }
}
