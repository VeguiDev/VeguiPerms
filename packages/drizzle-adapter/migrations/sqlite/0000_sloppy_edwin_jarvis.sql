CREATE TABLE `vperms_grants` (
	`workspace_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`permission` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `subject_id`, `permission`)
);
--> statement-breakpoint
CREATE TABLE `vperms_subjects` (
	`workspace_id` text NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`parents` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`)
);
