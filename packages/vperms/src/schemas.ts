import { SubjectType } from "@vperms/core";
import { z } from "zod";

export const WorkspaceIdSchema = z.string().min(1);

export const SubjectIdSchema = z.string().min(1);

const PERMISSION_PATTERN = /^[^.]+(?:\.[^.]+)*$/;

/**
 * A dot-separated permission pattern. Segments may not be empty, so `""`,
 * `"."`, `".workspaces.read"`, `"workspaces..read"` and `"workspaces."` are
 * all rejected. Wildcards are allowed.
 */
export const PermissionSchema = z
  .string()
  .min(1)
  .regex(PERMISSION_PATTERN, "invalid permission pattern");

export const SubjectTypeSchema = z.enum(SubjectType);

export const SubjectSchema = z.object({
  id: SubjectIdSchema,
  type: SubjectTypeSchema,
  parents: z.array(SubjectIdSchema),
});

export const PermissionGrantSchema = z.object({
  permission: PermissionSchema,
  value: z.boolean(),
  subjectId: SubjectIdSchema,
  workspaceId: WorkspaceIdSchema,
});

export type ValidatedSubject = z.infer<typeof SubjectSchema>;
export type ValidatedPermissionGrant = z.infer<typeof PermissionGrantSchema>;
