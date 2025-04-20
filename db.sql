DROP TABLE IF EXISTS commits;

DROP TABLE IF EXISTS releases;

DROP TABLE IF EXISTS repos;

CREATE TABLE IF NOT EXISTS releases (
	id int NOT NULL UNIQUE,
	content longtext NOT NULL,
	repoID int NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS repos (
	id int NOT NULL UNIQUE,
	user text NOT NULL,
	name text NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS commits (
	hash text NOT NULL,
	message text NOT NULL,
	releaseID int NOT NULL
);


ALTER TABLE releases ADD CONSTRAINT repo_fk0 FOREIGN KEY (repoID) REFERENCES repos(id);

ALTER TABLE commits ADD CONSTRAINT commit_fk2 FOREIGN KEY (releaseID) REFERENCES releases(id);