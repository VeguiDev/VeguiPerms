CREATE TABLE "vperms_grants" (
	"workspace_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"permission" text NOT NULL,
	"value" boolean NOT NULL,
	CONSTRAINT "vperms_grants_workspace_id_subject_id_permission_pk" PRIMARY KEY("workspace_id","subject_id","permission")
);
--> statement-breakpoint
CREATE TABLE "vperms_subjects" (
	"workspace_id" text NOT NULL,
	"id" text NOT NULL,
	"type" text NOT NULL,
	"parents" jsonb NOT NULL,
	CONSTRAINT "vperms_subjects_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
