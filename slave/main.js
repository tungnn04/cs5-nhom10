const mysql = require('mysql2/promise')
const redis = require('redis')
const Crawler = require('./crawler')
const STREAM_NAME = 'mystream';
const GROUP_NAME = 'mygroup';
const CONSUMER_NAME = process.env.HOSTNAME;

const start = async () => {
    try {
        const db = await mysql.createConnection({
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

        while (true) {
            const result = await client.xReadGroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {
                    key: STREAM_NAME,
                    id: '>',
                },
                {
                    BLOCK: 0,
                    COUNT: 1,
                }
            );

            if (result) {
                for (const message of result[0].messages) {
                    try {
                        const id = message.id;
                        const values = message.message;
                        await crawler.fetchRepo(values)
                        await client.xAck(STREAM_NAME, GROUP_NAME, id);
                    } catch (error) {
                        
                    }
                }
            } else {
                console.log('No messages');
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

start()