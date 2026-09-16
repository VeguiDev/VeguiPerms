import type { Subject, SubjectType } from "vperms";

export interface RequestAbility {
  can(permission: string): Promise<boolean>;
}

declare global {
  namespace Express {
    interface Request {
      ability: RequestAbility;
      subject?: Subject;
      kind?: SubjectType;
    }
  }
}
