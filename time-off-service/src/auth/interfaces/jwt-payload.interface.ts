export interface JwtPayload {
  sub: string; // actorId (UUID)
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  iat: number;
  exp: number;
}

export type UserRole = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
