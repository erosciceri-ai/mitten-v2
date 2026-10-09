import type { GestureWithMeta } from '../models/Gesture.js';
import { findAllGestures } from '../models/Gesture.js';
import { findUserById } from '../models/User.js';

export interface AccountExport {
  format: 'mitten-account-export';
  version: 1;
  exportedAt: string;
  account: {
    id: number;
    email: string;
    googleLinked: boolean;
    createdAt: string;
    updatedAt: string;
  };
  gestures: GestureWithMeta[];
}

export async function exportAccountData(userId: number): Promise<AccountExport | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  return {
    format: 'mitten-account-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      googleLinked: Boolean(user.google_sub),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    gestures: await findAllGestures(user.id),
  };
}
