CREATE TABLE `debriefs` (
	`id` text PRIMARY KEY NOT NULL,
	`sessionId` text NOT NULL,
	`recognition` text,
	`recognitionExplanation` text,
	`executionScore` integer NOT NULL,
	`scoreBreakdown` text NOT NULL,
	`holisticScore` integer NOT NULL,
	`holisticComment` text NOT NULL,
	`outcome` text NOT NULL,
	`outcomeNote` text NOT NULL,
	`summary` text NOT NULL,
	`promptVersion` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`sessionId`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debriefs_sessionId_unique` ON `debriefs` (`sessionId`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`progressDone` integer NOT NULL,
	`progressTotal` integer NOT NULL,
	`error` text,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`finishedAt` integer
);
--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`task` text NOT NULL,
	`refType` text,
	`refId` text,
	`model` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`durationMs` integer NOT NULL,
	`promptTokens` integer,
	`completionTokens` integer,
	`requestMessages` text NOT NULL,
	`responseText` text,
	`error` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `merge_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text NOT NULL,
	`methodologyIds` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sessionId` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`turn` integer NOT NULL,
	`content` text NOT NULL,
	`meta` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`sessionId`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_session_seq_unique` ON `messages` (`sessionId`,`seq`);--> statement-breakpoint
CREATE TABLE `methodologies` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text,
	`status` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`originChunkIds` text NOT NULL,
	`createdBy` text NOT NULL,
	`mergedIntoId` text,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`confirmedAt` integer,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `methodology_tags` (
	`methodologyId` text NOT NULL,
	`tagId` text NOT NULL,
	PRIMARY KEY(`methodologyId`, `tagId`),
	FOREIGN KEY (`methodologyId`) REFERENCES `methodologies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`scenarioId` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`selectedMethodologyId` text,
	`targetSnapshot` text,
	`selectedSnapshot` text,
	`hintUsed` integer DEFAULT false NOT NULL,
	`maxTurns` integer NOT NULL,
	`endReason` text,
	`endNote` text,
	`createdAt` integer NOT NULL,
	`startedAt` integer,
	`endedAt` integer,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`targetMethodologyId` text NOT NULL,
	`targetVersion` integer NOT NULL,
	`difficulty` text NOT NULL,
	`scope` text NOT NULL,
	`candidateIds` text NOT NULL,
	`title` text NOT NULL,
	`background` text NOT NULL,
	`userRole` text NOT NULL,
	`userGoal` text NOT NULL,
	`counterpartName` text NOT NULL,
	`counterpartRelation` text NOT NULL,
	`counterpartProfile` text NOT NULL,
	`openingSpeaker` text NOT NULL,
	`openingLine` text,
	`brief` text NOT NULL,
	`alternatives` text NOT NULL,
	`designNotes` text NOT NULL,
	`promptVersion` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`targetMethodologyId`) REFERENCES `methodologies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text NOT NULL,
	`seq` integer NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`charCount` integer NOT NULL,
	`extractionStatus` text NOT NULL,
	`extractionError` text,
	`extractedAt` integer,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_chunks_source_seq_unique` ON `source_chunks` (`sourceId`,`seq`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`format` text NOT NULL,
	`originalFilename` text NOT NULL,
	`filePath` text NOT NULL,
	`charCount` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `verdicts` (
	`id` text PRIMARY KEY NOT NULL,
	`debriefId` text NOT NULL,
	`kind` text NOT NULL,
	`stepId` text,
	`refId` text NOT NULL,
	`aiVerdict` text NOT NULL,
	`aiQuality` integer,
	`verdict` text NOT NULL,
	`quality` integer,
	`evidenceDowngraded` integer DEFAULT false NOT NULL,
	`comment` text NOT NULL,
	`suggestion` text,
	`evidence` text NOT NULL,
	`rewrite` text,
	`overrideVerdict` text,
	`overrideQuality` integer,
	`overrideReason` text,
	`overriddenAt` integer,
	FOREIGN KEY (`debriefId`) REFERENCES `debriefs`(`id`) ON UPDATE no action ON DELETE cascade
);
