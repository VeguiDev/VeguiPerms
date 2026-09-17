import {
  canResolved,
  type ResolvedPermission,
  type ResolvedSubject,
} from "vperms";

/**
 * A synchronous view over a single resolved permission snapshot.
 *
 * The ability is immutable by contract: it evaluates the snapshot it was
 * created from and never resolves inheritance, default parents or adapters.
 */
export class PermissionAbility {
  readonly subject: ResolvedSubject;
  readonly permissions: ResolvedPermission[];

  constructor(subject: ResolvedSubject) {
    this.subject = subject;
    this.permissions = [...subject.permissions];
  }

  can(permission: string): boolean {
    return canResolved(this.permissions, permission);
  }
}

export function createAbility(subject: ResolvedSubject): PermissionAbility {
  return new PermissionAbility(subject);
}

export { PermissionAbility as Ability };
