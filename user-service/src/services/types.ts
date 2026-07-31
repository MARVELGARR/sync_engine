export interface JWTPayload {
    sub: string;
    email: string;
    displayName: string;
    iat: number;
    exp: number;
}
