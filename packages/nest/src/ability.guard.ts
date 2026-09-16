import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Ability, Subject, SubjectType } from "vperms";
import { MISSING_CONTEXT_MESSAGE } from "./messages";
import type { VpermsRequest } from "./types";

/**
 * Base class for custom NestJS authorization guards.
 *
 * Subclasses implement {@link AbilityGuard.check} and reuse the request-scoped
 * ability hydrated once by `VPermsGuard`; they never resolve the principal or
 * touch the adapter again.
 */
export abstract class AbilityGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ability = this.getAbility(context);
    return this.check(ability, context);
  }

  protected abstract check(
    ability: Ability,
    context: ExecutionContext,
  ): boolean | Promise<boolean>;

  protected getAbility(context: ExecutionContext): Ability {
    const ability = this.request(context)?.ability;
    if (!ability) {
      throw new Error(MISSING_CONTEXT_MESSAGE);
    }
    return ability;
  }

  protected getSubject(context: ExecutionContext): Subject | undefined {
    return this.request(context)?.subject;
  }

  protected getKind(context: ExecutionContext): SubjectType | undefined {
    return this.request(context)?.kind;
  }

  private request(context: ExecutionContext): VpermsRequest | undefined {
    return context.switchToHttp().getRequest<VpermsRequest | undefined>();
  }
}
