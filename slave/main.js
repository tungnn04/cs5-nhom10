const mysql = require("mysql2/promise");
const Crawler = require("./crawler");

const start = async () => {
  try {
    const db = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      multipleStatements: true,
    });

    const crawler = new Crawler(db);
    await crawler.init();

    let lastRepo = {
      id: 148736243,
      stargazers_count: 26320,
    };
    let repoCount = 1000;

    const TOTAL_REPOS = 5000;

    while (repoCount < TOTAL_REPOS) {
      for (let i = 1; i <= 10 && repoCount < TOTAL_REPOS; i++) {
        let repos = await fetch(
          `https://api.github.com/search/repositories?q=stars:8000...${lastRepo.stargazers_count}&sort=stars&order=desc&per_page=100&page=${i}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.GITHUB_API_KEY}`,
            },
          }
        )
          .then((res) => res.json())
          .then((res) => res.items);
        if (i === 1) {
          const index = repos.findIndex((repo) => repo.id === lastRepo.id);
          repos = repos.slice(index + 1);
        } else if (i === 10) {
          lastRepo = repos[repos.length - 1];
        }
        repos = repos.slice(0, Math.min(repos.length, TOTAL_REPOS - repoCount));
        for (const repo of repos) {
          const repoInfo = {
            full_name: repo.full_name,
            id: repo.id.toString(),
            owner: repo.owner,
          };
          try {
            await crawler.fetchRepo(repoInfo);
            repoCount++;
            console.log(
              `    Repo ${repoInfo.full_name} processed successfully. Total count: ${repoCount}`
            );
          } catch (error) {
            console.error(
              `    ERROR processing repo ${repoInfo.full_name} (ID: ${repoInfo.id}):`,
              error
            );
          }
        }
        console.log("Repo count:", repoCount);
      }
      await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

start();
