import {
  boolean,
  json,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core";

export const vpermsSubjects = mysqlTable(
  "vperms_subjects",
  {
    workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
    id: varchar("id", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    parents: json("parents").$type<string[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const vpermsGrants = mysqlTable(
  "vperms_grants",
  {
    workspaceId: varchar("workspace_id", { length: 255 }).notNull(),
    subjectId: varchar("subject_id", { length: 255 }).notNull(),
    permission: varchar("permission", { length: 255 }).notNull(),
    value: boolean("value").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.subjectId, table.permission],
    }),
  ],
);

export const mysqlSchema = {
  vpermsSubjects,
  vpermsGrants,
};

export type MysqlSchema = typeof mysqlSchema;
