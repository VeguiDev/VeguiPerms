import type {
  Principal,
  Subject,
  SubjectId,
  VeguiPermsAdapter,
} from "@vperms/core";
import { SubjectType } from "@vperms/core";
import type { VeguiPermsService } from "./service";

/**
 * Minimal authorization surface shared by the framework integrations.
 *
 * It is intentionally tiny so a request ability can be produced once per
 * request and reused by guards, decorators and permission-export handlers.
 */
export interface Ability {
  can(permission: string): Promise<boolean>;
}

export const ANONYMOUS_SUBJECT_ID = "anonymous";

export function resolveSubjectId(subject: SubjectId | Principal): SubjectId {
  return typeof subject === "string" ? subject : subject.getSubjectId();
}

/**
 * Builds a request-scoped ability that memoizes `can()` results, so a single
 * permission is never evaluated twice within a request.
 */
export function createAbility(
  service: VeguiPermsService,
  workspaceId: string,
  subject: SubjectId | Principal,
): Ability {
  const cache = new Map<string, Promise<boolean>>();

  return {
    can(permission: string): Promise<boolean> {
      let result = cache.get(permission);
      if (result === undefined) {
        result = service.can(workspaceId, subject, permission);
        cache.set(permission, result);
      }
      return result;
    },
  };
}

/**
 * Loads the anonymous subject, creating it on demand so default parents
 * configured for {@link SubjectType.Anon} apply automatically.
 */
export async function ensureAnonymousSubject(
  adapter: VeguiPermsAdapter,
  service: VeguiPermsService,
  workspaceId: string,
): Promise<Subject> {
  const existing = await adapter.findSubject(workspaceId, ANONYMOUS_SUBJECT_ID);
  if (existing) {
    return existing;
  }
  return service.saveSubject(workspaceId, {
    id: ANONYMOUS_SUBJECT_ID,
    type: SubjectType.Anon,
    parents: [],
  });
}

export interface RequestContextInput {
  adapter: VeguiPermsAdapter;
  service: VeguiPermsService;
  workspaceId: string;
  subject: SubjectId | Principal | null | undefined;
}

/**
 * The hydrated, request-scoped VeguiPerms state shared by integrations.
 *
 * `id` is always the resolved subject id (including the anonymous fallback),
 * `subject` is the loaded record and is `undefined` when the adapter has no
 * record for `id`, and `ability` evaluates permissions for `id`.
 */
export interface RequestContext {
  id: SubjectId;
  subject: Subject | undefined;
  kind: SubjectType | undefined;
  ability: Ability;
}

/**
 * Resolves the request context exactly once: a `null`/`undefined` resolver
 * result becomes the anonymous subject, and the subject record is loaded a
 * single time from the adapter.
 */
export async function resolveRequestContext({
  adapter,
  service,
  workspaceId,
  subject: input,
}: RequestContextInput): Promise<RequestContext> {
  if (input === null || input === undefined) {
    const record = await ensureAnonymousSubject(adapter, service, workspaceId);
    return {
      id: record.id,
      subject: record,
      kind: record.type,
      ability: createAbility(service, workspaceId, record.id),
    };
  }

  const id = resolveSubjectId(input);
  const record = await adapter.findSubject(workspaceId, id);

  return {
    id,
    subject: record ?? undefined,
    kind: record?.type,
    ability: createAbility(service, workspaceId, id),
  };
}
