const winston = require('winston');

// Tạo logger với cấu hình tối ưu cho production
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'banking-notification' },
  transports: [
    // Ghi log vào console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Trong production, chỉ log error và info để tiết kiệm tài nguyên
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'error.log', 
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 2
  }));
}

module.exports = logger;
