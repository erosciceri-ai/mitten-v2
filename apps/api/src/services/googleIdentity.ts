import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/index.js';
import { AppError } from '../middleware/errorHandler.js';

export interface GoogleIdentity {
  subject: string;
  email: string;
}

const client = new OAuth2Client();

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (!config.googleClientId) {
    throw new AppError('Google sign-in is not configured', 503);
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AppError('Google account email is not verified', 401);
    }
    return { subject: payload.sub, email: payload.email };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid Google credential', 401);
  }
}
