export interface RequestAbility {
  can(permission: string): Promise<boolean>;
}

declare global {
  namespace Express {
    interface Request {
      ability: RequestAbility;
    }
  }
}
