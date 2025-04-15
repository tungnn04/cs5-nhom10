const mysql = require('mysql2/promise')
const Crawler = require('./crawler')

const start = async () => {
    try {
        const connection = await mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            multipleStatements: true,
        })

        const crawler = new Crawler(connection)
        await crawler.start()
    } catch (error) {
        console.error('Error:', error);
    }
}

start()