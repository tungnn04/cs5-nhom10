const { getLastPage, sleep } = require("./utils");
const Logger = require("./logger");
const fetch = require("node-fetch");
class Crawler {
  constructor(DATABASE) {
    this.DATABASE = DATABASE;
    this.apikey = process.env.GITHUB_API_KEY;
  }

  async init() {
    await this.DATABASE.query("SELECT 1");
  }

  async fetchWithRetry(url, retries = 10) {
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0",
            Authorization: `Bearer ${this.apikey}`,
          },
          timeout: 20000,
        });

        if (!response.ok)
          throw {
            message: response.statusText,
            status: response.status,
            url: url,
          };

        return response;
      } catch (error) {
        const errorCode = error.code;
        let delay = 1000 * (retries - attempt);

        console.log(
          `Error: ${error.message} - Status: ${error.status} - URL: ${
            error.url
          } - Retrying... (${retries - attempt})`
        );

        if (error.status === 404 || error.status === 422 || attempt === retries)
          throw error;

        if (error.status === 403 || error.status === 429) {
          throw error;
        } else if (errorCode === "EAI_AGAIN" || errorCode === "ENOTFOUND") {
          delay = Math.max(delay, 5000);
        } else if (
          errorCode === "ETIMEDOUT" ||
          errorCode === "ESOCKETTIMEDOUT" ||
          errorCode === "ECONNRESET" ||
          errorCode === "ECONNREFUSED"
        ) {
          delay = Math.max(delay, 3000);
        }

        await sleep(delay);
        attempt++;
      }
    }
  }

  async getReleases(repo, page) {
    try {
      const releases = await this.fetchWithRetry(
        `https://api.github.com/repos/${repo.full_name}/releases?page=${page}&per_page=100`
      ).then((res) => res.json());
      const commits = await Promise.all(
        releases
          .slice(1)
          .map((e, i) => this.getCommitBetweenReleases(repo, e, releases[i]))
      );
      return {
        commits: commits.flat(),
        releases: releases.map((e) => [e.id, e.body || "None", repo.id]),
      };
    } catch (error) {
      if (error.status === 404 || error.status === 422) {
        return { releases: [], commits: [] };
      }
      throw error;
    }
  }

  async fetchRepo(repo) {
    let releases = [];
    let commits = [];
    try {
      const response = await this.fetchWithRetry(
        `https://api.github.com/repos/${repo.full_name}/releases?page=1&per_page=1`
      );
      const total = getLastPage(response.headers.get("link"));
      for (let i = 1; i <= Math.min(Math.ceil(total / 100), 10); i++) {
        const res = await this.getReleases(repo, i);
        releases = releases.concat(res.releases);
        commits = commits.concat(res.commits);
      }
      await this.saveRepo(repo, releases, commits)
        .then(() => {
          console.log(
            `Repo: ${repo.full_name} - Releases: ${releases.length} - Commits: ${commits.length}`
          );
          Logger.info(
            `Repo: ${repo.full_name} - Releases: ${releases.length} - Commits: ${commits.length}`
          );
        })
        .catch((error) => {
          console.error(
            `Error saving repo ${repo.full_name}: ${error.message}`
          );
          Logger.error(`Error saving repo ${repo.full_name}: ${error.message}`);
        });
    } catch (error) {
      console.error(`Error fetching repo ${repo.full_name}: ${error.message}`);
      Logger.error(`Error fetching repo ${repo.full_name}: ${error.message}`);
      throw error;
    }
  }

  async getCommitBetweenReleases(repo, from, to) {
    try {
      const commits = await this.fetchWithRetry(
        `https://api.github.com/repos/${repo.full_name}/compare/${from.tag_name}...${to.tag_name}`
      )
        .then((res) => res.json())
        .then((res) => res.commits);
      return commits.map((commit) => [
        commit.sha,
        commit.commit.message || "None",
        from.id,
      ]);
    } catch (error) {
      if (error.status === 404 || error.status === 422) {
        return [];
      }
      throw error;
    }
  }

  async saveRepo(repo, releases, commits) {
    await this.DATABASE.query(
      `INSERT INTO repos (id, user, name) VALUES (?, ?, ?)`,
      [repo.id, repo.owner, repo.full_name]
    );

    for (const [id, content, repoID] of releases) {
      await this.DATABASE.query(
        `INSERT INTO releases (id, content, repoID) VALUES (?, ?, ?)`,
        [id, content, repoID]
      );
    }

    for (const [hash, message, releaseID] of commits) {
      await this.DATABASE.query(
        `INSERT INTO commits (hash, message, releaseID) VALUES (?, ?, ?)`,
        [hash, message, releaseID]
      );
    }
  }
}

module.exports = Crawler;
