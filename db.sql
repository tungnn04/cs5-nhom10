CREATE TABLE IF NOT EXISTS `release` (
	`id` int NOT NULL UNIQUE,
	`content` text NOT NULL,
	`repoID` int NOT NULL,
	PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `repo` (
	`id` int NOT NULL UNIQUE,
	`user` text NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `commit` (
	`hash` text NOT NULL,
	`message` text NOT NULL,
	`releaseID` int NOT NULL
);

ALTER TABLE `release` ADD CONSTRAINT `repo_fk0` FOREIGN KEY (`repoID`) REFERENCES `repo`(`id`);
ALTER TABLE `commit` ADD CONSTRAINT `commit_fk2` FOREIGN KEY (`releaseID`) REFERENCES `release`(`id`);