import { v4 as uuidv4 } from "uuid";

type PairToken = {
  token: string;
  created: number;
  expiresAt: number;
  meta?: any;
  oneTime?: boolean;
};

class AuthService {
  private tokens = new Map<string, PairToken>();

  createPairToken(meta?: any, ttl = 2 * 60 * 1000, oneTime = false) {
    const token = uuidv4();
    const now = Date.now();
    const entry: PairToken = {
      token,
      created: now,
      expiresAt: now + ttl,
      meta,
      oneTime,
    };
    this.tokens.set(token, entry);
    return entry;
  }

  validateToken(token?: string) {
    if (!token) return false;
    // allow static secret from env for convenience
    if (process.env.SOCKET_SECRET && token === process.env.SOCKET_SECRET)
      return true;
    const entry = this.tokens.get(token);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  // Consume token: validate and remove if oneTime
  consumeToken(token?: string) {
    if (!token) return false;
    if (process.env.SOCKET_SECRET && token === process.env.SOCKET_SECRET)
      return true;
    const entry = this.tokens.get(token);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return false;
    }
    if (entry.oneTime) this.tokens.delete(token);
    return true;
  }

  revoke(token: string) {
    return this.tokens.delete(token);
  }

  get(token: string) {
    const e = this.tokens.get(token);
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.tokens.delete(token);
      return null;
    }
    return e;
  }
}

export const authService = new AuthService();
