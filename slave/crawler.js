const { getLastPage, sleep } = require('./utils')
const Logger = require('./logger');
const fetch = require('node-fetch')
const TorController = require('./tor')

const API_KEY = 'API_KEY'
const TOR = 'TOR'

class Crawler {
    constructor(DATABASE) {
        this.DATABASE = DATABASE
        this.repos = []
        this.releases = []
        this.commits = []
        this.tokens = process.env.GITHUB_API_KEY.split(',')
        this.currentToken = 0
        this.tors = process.env.TORS_LIST.split(',').map(tor => new TorController(tor))
        this.currentTor = 0
        this.option = API_KEY
    }

    async init() {
        const { default: PQueue } = await import("p-queue")
        this.queue = new PQueue({ concurrency: 60, })
        this.queue.start()
        await Promise.all(this.tors.map(tor => tor.connect()))
    }

    async fetchWithRetry(url, options, retries = 20) {
        this.currentTor = (this.currentTor + 1) % this.tors.length
        const Tor = this.tors[this.currentTor]
        try {
            const response = await fetch(url, {
                method: 'GET',
                agent: this.option === TOR ? Tor.agent : undefined,
                headers: {
                    'Authorization': this.option === API_KEY ? `Bearer ${this.tokens[this.currentToken]}` : undefined,
                }
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
                throw error;
            }
            if (error.status === 403 || error.status === 429) {
                if (this.option === TOR) {
                    await Tor.rotateIP()
                }
                if (this.option === API_KEY) {
                    if (this.currentToken === this.tokens.length - 1) {
                        this.option = TOR
                    } else {
                        this.currentToken++
                    }
                }
            }
            await sleep(200 * (20 - retries))
            console.log(`Error: ${error.message} - Status: ${error.status} - URL: ${error.url} - Retrying... (${retries})`);
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
            Logger.info(`Repo: ${repo.full_name} - Releases: ${release.flatMap(r => r.releases).length} - Commits: ${release.flatMap(r => r.commits).length}`);
            this.releases.push(...release.flatMap(r => r.releases))
            this.commits.push(...release.flatMap(r => r.commits))
            this.repos.push([repo.id, repo.owner, repo.name])
        } catch (error) {
            Logger.error(`Error fetching repo ${repo.full_name}: ${error.message}`);
            throw error
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

    async save() {
        console.log('Saving data...')
        console.log('Repos:', this.repos.length)
        console.log('Releases:', this.releases.length)
        console.log('Commits:', this.commits.length)
        // await this.DATABASE.query(`INSERT INTO repos (id, user, name) VALUES ?`, [this.repos])
        // await this.DATABASE.query(`INSERT INTO releases (id, content, repoID) VALUES ?`, [this.releases])
        // await this.DATABASE.query(`INSERT INTO commits (hash, message, releaseID) VALUES ?`, [this.commits])
    }
}

module.exports = Crawler