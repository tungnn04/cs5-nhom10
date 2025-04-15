const { getLastPage, sleep } = require('./utils')
const Logger = require('./logger');
const fetch = require('node-fetch')
const TorController = require('./tor')

const TOR = 'TOR'
const API_KEY = 'API_KEY'

class Crawler {
    constructor(DATABASE) {
        this.DATABASE = DATABASE
        this.repos = []
        this.releases = []
        this.commits = []
        this.tokens = process.env.GITHUB_API_KEY.split(',')
        this.currentToken = 0
        this.tors = [
            new TorController("tor1", 9051, "pmquy", 'socks5h://tor1:9050'),
            new TorController("tor2", 9051, "pmquy", 'socks5h://tor2:9050'),
            new TorController("tor3", 9051, "pmquy", 'socks5h://tor3:9050'),
            new TorController("tor4", 9051, "pmquy", 'socks5h://tor4:9050'),
            new TorController("tor5", 9051, "pmquy", 'socks5h://tor5:9050'),
        ]
        this.option = API_KEY
        this.currentTor = 0
    }

    async start() {
        const { default: PQueue } = await import("p-queue")
        this.queue = new PQueue({
            concurrency: 60,
        })
        this.queue.start()
        await Promise.all(this.tors.map(tor => tor.connect()))
        await this.clear()
        await this.getRepos(1)
    }

    async fetchWithRetry(url, options, retries = 50) {
        this.currentTor = (this.currentTor + 1) % this.tors.length
        const Tor = this.tors[this.currentTor]
        try {
            const response = await fetch(url, {
                method: 'GET',
                agent: Tor.agent,
                // headers: {
                //     'Authorization': this.currentToken != -1 ? `Bearer ${this.tokens[this.currentToken]}` : undefined,
                // }
            });
            if (!response.ok) {
                throw {
                    message: response.statusText,
                    status: response.status,
                    url: url
                }
            }
            return response
        } catch (error) {
            if (error.status === 404 || retries === 0) {
                Logger.error(`URL: ${error.url} - Status: ${error.status} - Message: ${error.message}`);
                throw error;
            }
            if (error.status === 403 || error.status === 429) {
            
            }
            console.log(`Error: ${error.message} - Status: ${error.status} - URL: ${error.url} - Retrying... (${retries})`);
            await Tor.rotateIP()
            await sleep(1000)
            return this.fetchWithRetry(url, options, retries - 1)
        }
    }

    async fetchWithQueue(url, options) {
        return this.queue.add(() => this.fetchWithRetry(url, options))
    }

    async getReleases(repo, page) {
        try {
            const releases = await this.fetchWithQueue(`https://api.github.com/repos/${repo.full_name}/releases?page=${page}&per_page=100`).then(res => res.json())
            const commits = await Promise.all(releases.map((release, i) => {
                if (i) {
                    return this.getCommitBetweenReleases.call(this, repo, release.tag_name, releases[i - 1].tag_name)
                }
            }))
            return {
                commits: commits.flat(),
                releases: releases.map(release => [release.id, release.body, repo.id])
            }
        } catch (error) {
            return {
                releases: [],
                commits: []
            }
        }
    }

    async fetchRepo(repo) {
        try {
            const response = await this.fetchWithQueue(`https://api.github.com/repos/${repo.full_name}/releases?page=1&per_page=1`)
            const total = getLastPage(response.headers.get('link'))
            const release = await Promise.all(new Array(Math.min(Math.ceil(total / 100), 10)).fill(0).map((_, i) => this.getReleases.call(this, repo, i + 1)));
            return {
                releases: release.flatMap(r => r.releases),
                commits: release.flatMap(r => r.commits)
            }
        } catch (error) {
            return {
                releases: [],
                commits: []
            }
        }
    }

    async getCommitBetweenReleases(repo, from, to) {
        try {
            const commits = await this.fetchWithQueue(`https://api.github.com/repos/${repo.full_name}/compare/${from}...${to}`).then(res => res.json()).then(res => res.commits)
            return commits.map(commit => [commit.sha, commit.commit.message, repo.id])
        } catch (error) {
            return []
        }
    }

    async getRepos(page) {
        try {
            const repos = await this.fetchWithQueue(`https://api.github.com/search/repositories?q=stars:>5000&sort=stars&order=desc&per_page=100&page=1`).then(res => res.json()).then(res => res.items)
            const res = []
            for (const repo of repos) {
                const t = await this.fetchRepo.call(this, repo)
                Logger.info(`Fetching repo: ${repo.full_name} - Releases: ${t.releases.length} - Commits: ${t.commits.length}`);
                res.push(t)
            }
            this.repos = repos.map(repo => [repo.id, repo.owner.login, repo.name])
            this.releases = res.flatMap(r => r.releases)
            this.commits = res.flatMap(r => r.commits)
        } catch (error) {
        } finally {
            console.log(this.repos.length, this.releases.length, this.commits.length)
        }
    }

    async save() {
        await this.DATABASE.query(`INSERT INTO repos (id, user, name) VALUES ?`, [this.repos])
        await this.DATABASE.query(`INSERT INTO releases (id, content, repoID) VALUES ?`, [this.releases])
        await this.DATABASE.query(`INSERT INTO commits (hash, message, releaseID) VALUES ?`, [this.commits])
    }

    async clear() {
        await this.DATABASE.query(`
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
        `)
    }
}

module.exports = Crawler