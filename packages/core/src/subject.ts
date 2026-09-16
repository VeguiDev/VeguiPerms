export type SubjectId = string;

export enum SubjectType {
  User = "user",
  Service = "service",
  Group = "group",
}

export interface Subject {
  id: SubjectId;
  type: SubjectType;
  /**
   * IDs of the subjects this subject inherits permissions from.
   *
   * An entry prefixed with `!` is a negation directive rather than a parent:
   * it opts the subject out of a virtual parent coming from
   * {@link DefaultParents}.
   */
  parents: SubjectId[];
}

/**
 * Anything that can be resolved to a {@link SubjectId}.
 *
 * Permission APIs accept either a raw `SubjectId` or a `Principal`, and
 * normalize the input internally.
 */
export interface Principal {
  getSubjectId(): SubjectId;
}

/**
 * Virtual parents applied on top of a subject's explicit `parents`.
 *
 * `global` applies to every subject, while `byType` applies only to subjects
 * of the matching {@link SubjectType}. Virtual parents are never persisted:
 * they are resolved at evaluation time.
 */
export interface DefaultParents {
  global?: SubjectId[];
  byType?: Partial<Record<SubjectType, SubjectId[]>>;
}
