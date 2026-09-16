CREATE TABLE `vperms_grants` (
	`workspace_id` varchar(255) NOT NULL,
	`subject_id` varchar(255) NOT NULL,
	`permission` varchar(255) NOT NULL,
	`value` boolean NOT NULL,
	CONSTRAINT `vperms_grants_workspace_id_subject_id_permission_pk` PRIMARY KEY(`workspace_id`,`subject_id`,`permission`)
);
--> statement-breakpoint
CREATE TABLE `vperms_subjects` (
	`workspace_id` varchar(255) NOT NULL,
	`id` varchar(255) NOT NULL,
	`type` varchar(32) NOT NULL,
	`parents` json NOT NULL,
	CONSTRAINT `vperms_subjects_workspace_id_id_pk` PRIMARY KEY(`workspace_id`,`id`)
);
