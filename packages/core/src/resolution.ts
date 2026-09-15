import type { VeguiPermsAdapter } from "./adapter";
import type { ResolvedPermissionGrant } from "./permission";
import { compareGrants } from "./specificity";
import type { Subject } from "./subject";

interface PendingParent {
  id: string;
  depth: number;
}

/**
 * Resolves the permissions inherited from a subject's ancestors.
 *
 * Parents are walked breadth-first so each subject is visited at its closest
 * depth, and a visited set prevents infinite recursion through cyclic
 * inheritance. The resulting grants carry their inheritance `depth`, and are
 * returned already ordered by inheritance priority and specificity.
 */
export async function resolveInheritedPermissions(
  adapter: VeguiPermsAdapter,
  workspaceId: string,
  subject: Subject,
): Promise<ResolvedPermissionGrant[]> {
  const visited = new Set<string>([subject.id]);
  const resolved: ResolvedPermissionGrant[] = [];

  let frontier: PendingParent[] = subject.parents.map((id) => ({
    id,
    depth: 1,
  }));

  while (frontier.length > 0) {
    const next: PendingParent[] = [];

    for (const { id, depth } of frontier) {
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);

      const parent = await adapter.findSubject(workspaceId, id);
      if (!parent) {
        continue;
      }

      const grants = await adapter.findSubjectGrants(workspaceId, id);
      for (const grant of grants) {
        resolved.push({ ...grant, depth });
      }

      for (const parentId of parent.parents) {
        next.push({ id: parentId, depth: depth + 1 });
      }
    }

    frontier = next;
  }

  return resolved.sort(compareGrants);
}
