export enum SubjectType {
  User = "user",
  Service = "service",
  Group = "group",
}

export interface Subject {
  id: string;
  type: SubjectType;
  /**
   * IDs of the subjects this subject inherits permissions from.
   */
  parents: string[];
}
