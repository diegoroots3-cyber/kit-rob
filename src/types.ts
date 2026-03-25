export interface Kit {
  id: string;
  name: string;
  identifier: string;
  description?: string;
}

export interface Item {
  id: string;
  kitId: string;
  name: string;
  totalQuantity: number;
  availableQuantity: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  class?: string;
}

export interface LoanItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface Loan {
  id: string;
  userId: string;
  userName: string;
  kitId: string;
  kitName: string;
  items: LoanItem[];
  status: 'active' | 'returned';
  createdAt: Date;
  returnedAt?: Date;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
