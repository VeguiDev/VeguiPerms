import type { SubjectType } from "@vperms/core";

/**
 * A subject document as stored in MongoDB.
 */
export type SubjectDocument = {
  workspaceId: string;
  id: string;
  type: SubjectType;
  parents: string[];
};

/**
 * A permission grant document as stored in MongoDB.
 */
export type GrantDocument = {
  workspaceId: string;
  subjectId: string;
  permission: string;
  value: boolean;
};

export const SUBJECTS_COLLECTION = "vperms_subjects";
export const GRANTS_COLLECTION = "vperms_grants";
