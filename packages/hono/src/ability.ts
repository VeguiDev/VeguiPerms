import type { Ability, Subject, SubjectType } from "vperms";

export type RequestAbility = Ability;

/**
 * Hono context variables populated by {@link vpermsMiddleware}.
 *
 * Export this type so applications can type their own middleware chains with
 * `Env = VPermsEnv` and keep `c.var` / `c.get` aware of the VeguiPerms state.
 */
export interface VPermsVariables {
  ability: RequestAbility;
  subject: Subject | undefined;
  kind: SubjectType | undefined;
}

export interface VPermsEnv {
  Variables: VPermsVariables;
}
