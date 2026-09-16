import { boolean, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const vpermsSubjects = pgTable(
  "vperms_subjects",
  {
    workspaceId: text("workspace_id").notNull(),
    id: text("id").notNull(),
    type: text("type").notNull(),
    parents: jsonb("parents").$type<string[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const vpermsGrants = pgTable(
  "vperms_grants",
  {
    workspaceId: text("workspace_id").notNull(),
    subjectId: text("subject_id").notNull(),
    permission: text("permission").notNull(),
    value: boolean("value").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.subjectId, table.permission],
    }),
  ],
);

export const postgresSchema = {
  vpermsSubjects,
  vpermsGrants,
};

export type PostgresSchema = typeof postgresSchema;
