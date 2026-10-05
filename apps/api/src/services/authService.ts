import bcrypt from 'bcrypt';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { userRepository } from '../repositories/userRepository';
import { User, UserPublic, RegisterRequest, LoginRequest, AuthResponse, JWTPayload, AppError } from '../types';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const { email, password } = data;

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw AppError.validation('Invalid email format');
    }

    // Validate password strength
    if (!this.isValidPassword(password)) {
      throw AppError.validation('Password must be at least 8 characters long');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user (handles UNIQUE constraint violation)
    let user: User;
    try {
      user = userRepository.create(email, passwordHash);
    } catch (error) {
      if (error instanceof Error && error.message.includes('User with this email already exists')) {
        throw AppError.conflict('User with this email already exists', { field: 'email' });
      }
      throw error;
    }

    // Generate JWT
    const token = this.generateToken(user);

    return {
      user: userRepository.toPublic(user),
      token,
    };
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const { email, password } = data;

    // Find user
    const user = userRepository.findByEmail(email);
    if (!user) {
      // Use same error message for both non-existent user and wrong password
      throw AppError.unauthorized('Invalid email or password');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Generate JWT
    const token = this.generateToken(user);

    return {
      user: userRepository.toPublic(user),
      token,
    };
  }

  verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      
      // Validate required claims
      if (typeof decoded.userId !== 'number' || typeof decoded.email !== 'string') {
        throw AppError.unauthorized('Invalid token payload');
      }

      return {
        userId: decoded.userId,
        email: decoded.email,
        iat: decoded.iat,
        exp: decoded.exp,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw AppError.unauthorized('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw AppError.unauthorized('Invalid token');
      }
      throw AppError.unauthorized('Token verification failed');
    }
  }

  generateToken(user: User): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
    };

    const signOptions: SignOptions = {
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    };

    return jwt.sign(payload, config.jwtSecret, signOptions);
  }

  async getUserById(userId: number): Promise<UserPublic | null> {
    const user = userRepository.findById(userId);
    return user ? userRepository.toPublic(user) : null;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPassword(password: string): boolean {
    return password.length >= 8;
  }
}

export const authService = new AuthService();