import { SubjectType, VIRTUAL_PARENT_NEGATION } from "@vperms/core";
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

/**
 * A virtual parent ID. Unlike {@link SubjectSchema}'s `parents`, default
 * parents cannot be negation directives: opting out happens on the subject,
 * never in the configuration.
 */
export const DefaultParentIdSchema = SubjectIdSchema.refine(
  (id) => !id.startsWith(VIRTUAL_PARENT_NEGATION),
  "a default parent cannot be a negation directive",
);

export const DefaultParentsSchema = z.object({
  global: z.array(DefaultParentIdSchema).optional(),
  byType: z
    .partialRecord(SubjectTypeSchema, z.array(DefaultParentIdSchema))
    .optional(),
});

export const PermissionGrantSchema = z.object({
  permission: PermissionSchema,
  value: z.boolean(),
  subjectId: SubjectIdSchema,
  workspaceId: WorkspaceIdSchema,
});

export const ResolvedPermissionSchema = z.object({
  permission: PermissionSchema,
  value: z.boolean(),
  weight: z.number(),
});

export const ResolvedSubjectSchema = z.object({
  id: SubjectIdSchema,
  type: SubjectTypeSchema,
  parents: z.array(SubjectIdSchema),
  permissions: z.array(ResolvedPermissionSchema),
});

export type ValidatedSubject = z.infer<typeof SubjectSchema>;
export type ValidatedPermissionGrant = z.infer<typeof PermissionGrantSchema>;
export type ValidatedDefaultParents = z.infer<typeof DefaultParentsSchema>;
export type ValidatedResolvedPermission = z.infer<
  typeof ResolvedPermissionSchema
>;
export type ValidatedResolvedSubject = z.infer<typeof ResolvedSubjectSchema>;
