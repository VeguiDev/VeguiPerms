/**
 * Raised when a resolved-permission request targets a subject that does not
 * exist in the adapter. Integrations typically map this to HTTP 404.
 */
export class SubjectNotFoundError extends Error {
  readonly subjectId: string;

  constructor(subjectId: string) {
    super(`subject "${subjectId}" was not found`);
    this.name = "SubjectNotFoundError";
    this.subjectId = subjectId;
  }
}

/**
 * Raised when a subject is not allowed to read resolved permissions.
 * Integrations typically map this to HTTP 403.
 */
export class PermissionDeniedError extends Error {
  readonly permission: string;

  constructor(permission: string) {
    super(`permission "${permission}" was denied`);
    this.name = "PermissionDeniedError";
    this.permission = permission;
  }
}

/**
 * Raised when a resolved-permission request carries a malformed subject id.
 * Integrations typically map this to HTTP 400.
 */
export class InvalidSubjectIdError extends Error {
  readonly subjectId: string;

  constructor(subjectId: string) {
    super(`invalid subject id "${subjectId}"`);
    this.name = "InvalidSubjectIdError";
    this.subjectId = subjectId;
  }
}
