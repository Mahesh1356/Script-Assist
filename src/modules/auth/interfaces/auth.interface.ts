export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: UserResponse;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface LoginResponse extends AuthResponse {}

export interface RegisterResponse extends AuthResponse {}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}
