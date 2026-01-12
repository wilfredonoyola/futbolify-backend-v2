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

    // For Futbolify, return all users if admin, otherwise just current user
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) {
      return this.userModel.find().exec();
    } else {
      return this.userModel.find({ _id: user.userId }).exec();
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
    // Only allow updating own profile or if admin
    const isAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
    const isOwnProfile = user.userId === id;
    
    if (!isAdmin && !isOwnProfile) {
      throw new ConflictException('You can only update your own profile');
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();

    if (!updatedUser) {
      throw new ConflictException('User not found');
    }

    return updatedUser;
  }

  async remove(id: string, user: CurrentUserPayload): Promise<void> {
    // Only admins can remove users
    const isAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
    
    if (!isAdmin) {
      throw new ConflictException('Only admins can remove users');
    }

    const removedUser = await this.userModel
      .findByIdAndDelete(id)
      .exec();

    if (!removedUser) {
      throw new ConflictException('User not found');
    }

    await this.authService.deleteUser(removedUser.email);
  }
}
