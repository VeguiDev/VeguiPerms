import type { DefaultParents, Subject, SubjectId } from "./subject";

/**
 * Prefix marking a negation directive in {@link Subject.parents}.
 *
 * `"!everyone"` means "do not apply the virtual parent `everyone`", and never
 * refers to a real subject.
 */
export const VIRTUAL_PARENT_NEGATION = "!";

/**
 * The effective parents of a subject, grouped by the layer they belong to.
 *
 * `explicit` are the real parents stored on the subject, `byType` are the
 * defaults configured for the subject's type, and `global` are the defaults
 * configured for every subject.
 */
export interface EffectiveParentLayers {
  explicit: SubjectId[];
  byType: SubjectId[];
  global: SubjectId[];
}

function negatedId(parent: SubjectId): SubjectId | null {
  if (!parent.startsWith(VIRTUAL_PARENT_NEGATION)) {
    return null;
  }
  return parent.slice(VIRTUAL_PARENT_NEGATION.length);
}

/**
 * Splits a subject's `parents` into explicit parents and negated virtual
 * parent IDs.
 *
 * Negation directives are removed from the explicit list and their target IDs
 * are collected in `excluded`.
 */
export function splitParents(parents: SubjectId[]): {
  explicit: SubjectId[];
  excluded: Set<SubjectId>;
} {
  const explicit: SubjectId[] = [];
  const seen = new Set<SubjectId>();
  const excluded = new Set<SubjectId>();

  for (const parent of parents) {
    const negated = negatedId(parent);
    if (negated !== null) {
      if (negated.length > 0) {
        excluded.add(negated);
      }
      continue;
    }
    if (seen.has(parent)) {
      continue;
    }
    seen.add(parent);
    explicit.push(parent);
  }

  return { explicit, excluded };
}

/**
 * Resolves the effective parents of `subject` in priority order.
 *
 * Negation directives only exclude virtual parents coming from `defaults`: an
 * explicitly assigned parent is always kept, even when the same ID is also
 * negated. IDs are deduplicated across layers, keeping the highest-priority
 * occurrence.
 */
export function effectiveParentLayers(
  subject: Subject,
  defaults?: DefaultParents,
): EffectiveParentLayers {
  const { explicit, excluded } = splitParents(subject.parents);
  const seen = new Set(explicit);

  const byType: SubjectId[] = [];
  const collect = (ids: SubjectId[] | undefined, target: SubjectId[]) => {
    for (const id of ids ?? []) {
      if (excluded.has(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      target.push(id);
    }
  };

  collect(defaults?.byType?.[subject.type], byType);

  const global: SubjectId[] = [];
  collect(defaults?.global, global);

  return { explicit, byType, global };
}
