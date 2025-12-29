import { KYCStatus } from './enums';

export interface User {
  id: string;
  email: string;
  phone: string;
  kycStatus: KYCStatus;
  cvlKraId?: string | null;
  cvlKraStatus?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  phone: string;
}
