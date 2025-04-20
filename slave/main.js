const mysql = require('mysql2/promise')
const redis = require('redis')
const Crawler = require('./crawler')
const STREAM_NAME = 'mystream';
const GROUP_NAME = 'mygroup';
const CONSUMER_NAME = process.env.HOSTNAME;

const start = async () => {
    try {
        const db = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            multipleStatements: true,
        })

        const client = redis.createClient({
            url: process.env.REDIS_URL,
        });

        await client.connect();

        await client.xGroupCreate(
            STREAM_NAME,
            GROUP_NAME,
            '$',
            {
                MKSTREAM: true,
            }
        ).catch(() => { })

        const crawler = new Crawler(db)
        await crawler.init()

        {
            let isRunning = false;

            setInterval(async () => {
                try {
                    if (isRunning) return
                    const result = await client.xPendingRange(STREAM_NAME, GROUP_NAME, '-', '+', 1, { IDLE: 10 * 60 * 1000 });
                    for (const entry of result) {
                        const claimed = await client.xClaim(
                            STREAM_NAME,
                            GROUP_NAME,
                            process.env.HOSTNAME,
                            60000,
                            [entry.id]
                        );

                        for (const msg of claimed) {
                            console.log('Retrying message:', msg.message);
                            try {
                                isRunning = true;
                                await crawler.fetchRepo(msg.message, () => client.xAck(STREAM_NAME, GROUP_NAME, msg.id));
                            } catch (e) {
                                console.error('Retry failed for message:', msg.id, e);
                            } finally {
                                isRunning = false;
                            }
                        }
                    }

                } catch (err) {
                    console.error('Error checking pending messages:', err);
                }
            }, 5000);
        }



        while (true) {
            const result = await client.xReadGroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {
                    key: STREAM_NAME,
                    id: '>',
                },
                {
                    BLOCK: 10000,
                    COUNT: 1,
                }
            );

            if (result) {
                for (const message of result[0].messages) {
                    try {
                        const id = message.id;
                        const values = message.message;
                        console.log('New message:', values);
                        await crawler.fetchRepo(values, () => client.xAck(STREAM_NAME, GROUP_NAME, id))
                    } catch (error) {

                    }
                }
            } else {
                break;
            }
        }

    } catch (error) {
        console.error('Error:', error);
        throw error
    }
}

start()