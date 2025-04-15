const { createLogger, transports, format } = require('winston');
const path = require('path');

const logger = createLogger({
    format: format.combine(
        format.timestamp(),
        format.printf(info => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`)
    ),
    transports: [
        new transports.File({ filename: path.join(__dirname, 'error.log') })
    ]
});

module.exports = logger;
