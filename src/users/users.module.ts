import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersService } from "./users.service";
import { UsersResolver } from "./users.resolver";
import { UserSchema } from "./schemas/user.schema";
import { AuthModule } from "src/auth/auth.module";
import { RolesGuard } from "src/auth/roles.guard";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "User", schema: UserSchema }]),
    forwardRef(() => AuthModule),
  ],
  providers: [UsersService, UsersResolver, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
