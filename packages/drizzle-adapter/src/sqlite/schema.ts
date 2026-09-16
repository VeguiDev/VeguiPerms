import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const vpermsSubjects = sqliteTable(
  "vperms_subjects",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    type: text("type").notNull(),
    parents: text("parents", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const vpermsGrants = sqliteTable(
  "vperms_grants",
  {
    workspaceId: text("workspace_id").notNull(),
    subjectId: text("subject_id").notNull(),
    permission: text("permission").notNull(),
    value: integer("value", { mode: "boolean" }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.subjectId, table.permission],
    }),
  ],
);

export const sqliteSchema = {
  vpermsSubjects,
  vpermsGrants,
};

export type SqliteSchema = typeof sqliteSchema;
