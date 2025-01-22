import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { CurrentUserPayload } from 'src/auth/current-user-payload.interface';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly authService: AuthService,
  ) {}
  async findById(id: string): Promise<UserDocument> {
    return this.userModel.findById(id).exec();
  }
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findAll(user: CurrentUserPayload): Promise<UserDocument[]> {
    if (!user || !user.roles) {
      throw new Error('User or user roles are undefined');
    }

    if (user.roles.includes('SUPER_ADMIN')) {
      return this.userModel.find().exec();
    } else {
      return this.userModel.find({ company: user.company._id }).exec();
    }
  }

  async updateOnboardingStatus(
    userId: string,
    isCompleted: boolean,
  ): Promise<void> {
    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { isOnboardingCompleted: isCompleted } },
      )
      .exec();
  }

  async update(
    id: string,
    updateUserDto: Partial<User>,
    user: CurrentUserPayload,
  ): Promise<UserDocument> {
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new ConflictException('SUPER_ADMIN cannot update users');
    }

    const updatedUser = await this.userModel
      .findOneAndUpdate({ _id: id, company: user.company._id }, updateUserDto, {
        new: true,
      })
      .exec();

    if (!updatedUser) {
      throw new ConflictException('User not found');
    }

    return updatedUser;
  }

  async remove(id: string, user: CurrentUserPayload): Promise<void> {
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new ConflictException('SUPER_ADMIN cannot remove users');
    }

    const removedUser = await this.userModel
      .findOneAndDelete({ _id: id, company: user.company._id })
      .exec();

    if (!removedUser) {
      throw new ConflictException('User not found');
    }

    await this.authService.deleteUser(removedUser.email);
  }
}
