import { UserRole } from 'src/users/schemas/user.schema';

export interface CurrentUserPayload {
  id: string;
  username: string;
  roles: string[];
  company?: {
    _id: string;
    name: UserRole;
  };
}
