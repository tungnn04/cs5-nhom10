const redis = require('redis');
const mysql = require('mysql2/promise')


const STREAM_NAME = 'mystream';

const start = async () => {

    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        multipleStatements: true,
    })

    await db.query('SELECT 1')

    // await db.query(`
    //     DROP TABLE IF EXISTS commits;

    //     DROP TABLE IF EXISTS releases;

    //     DROP TABLE IF EXISTS repos;

    //     CREATE TABLE IF NOT EXISTS releases (
    //         id int NOT NULL UNIQUE,
    //         content longtext NOT NULL,
    //         repoID int NOT NULL,
    //         PRIMARY KEY (id)
    //     );

    //     CREATE TABLE IF NOT EXISTS repos (
    //         id int NOT NULL UNIQUE,
    //         user text NOT NULL,
    //         name text NOT NULL,
    //         PRIMARY KEY (id)
    //     );

    //     CREATE TABLE IF NOT EXISTS commits (
    //         hash text NOT NULL,
    //         message text NOT NULL,
    //         releaseID int NOT NULL
    //     );


    //     ALTER TABLE releases ADD CONSTRAINT repo_fk0 FOREIGN KEY (repoID) REFERENCES repos(id);

    //     ALTER TABLE commits ADD CONSTRAINT commit_fk2 FOREIGN KEY (releaseID) REFERENCES releases(id);
    // `)

    const client = redis.createClient({
        url: process.env.REDIS_URL,
    });

    client.on('error', (err) => console.log('Redis Client Error', err));

    await client.connect();

    let lastRepo = {
        id: 148736243,
        stargazers_count: 26320
    }
    let repoCount = 1000;

    const TOTAL_REPOS = 5000;

    while (repoCount < TOTAL_REPOS) {
        for (let i = 1; i <= 10 && repoCount < TOTAL_REPOS; i++) {
            let repos = await fetch(`https://api.github.com/search/repositories?q=stars:8000...${lastRepo.stargazers_count}&sort=stars&order=desc&per_page=100&page=${i}`, {
                headers: {
                    "Authorization": `Bearer ${process.env.GITHUB_API_KEY}`,
                }
            }).then(res => res.json()).then(res => res.items)
            if (i === 1) {
                const index = repos.findIndex(repo => repo.id === lastRepo.id)
                repos = repos.slice(index + 1)
            } else if (i === 10) {
                lastRepo = repos[repos.length - 1]
            }
            repos = repos.slice(0, Math.min(repos.length, TOTAL_REPOS - repoCount))
            await Promise.all(repos.map((repo) => client.xAdd(
                STREAM_NAME,
                '*',
                {
                    'full_name': repo.full_name,
                    'id': repo.id.toString(),
                    'owner': repo.owner.login,
                }
            )))
            repoCount += repos.length
            console.log('Repo count:', repoCount);
        }
        await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    }

    await db.end();
    await client.quit();
}

start().catch(console.error);