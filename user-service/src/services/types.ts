export type TokenType = "access" | "guest";

export interface JWTPayload {
    sub: string;
    email: string;
    displayName: string;
    /** Token kind — "guest" for ephemeral guest sessions. */
    type: TokenType;
    /** True when the session belongs to a guest account. */
    isGuest: boolean;
    /** Must match users.token_version, else the token was revoked. */
    tv: number;
    iss: string;
    aud: string;
    jti: string;
    iat: number;
    exp: number;
}
