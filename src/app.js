require('dotenv').config();

// Tối ưu memory cho Fly.io free tier
if (process.env.NODE_ENV === 'production') {
  process.env.NODE_OPTIONS = '--max-old-space-size=200';
}

const express = require('express');
const cron = require('node-cron');
const database = require('./config/database');
const gmailService = require('./services/gmailService');
const emailParser = require('./services/emailParser');
const databaseService = require('./services/databaseService');
const logger = require('./utils/logger');

class BankingNotificationApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.isProcessing = false;
    this.cronJob = null;
    this.stats = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      lastProcessTime: null
    };
  }

  async initialize() {
    try {
      logger.info('Initializing Banking Notification App...');

      // Kết nối database
      await database.connect();
      await databaseService.initialize();

      // Khởi tạo Gmail service
      await gmailService.initialize();

      // Setup Express routes
      this.setupRoutes();

      // Bắt đầu cron job
      this.startCronJob();

      logger.info('App initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize app:', error);
      process.exit(1);
    }
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: database.getConnectionStatus(),
        gmail: gmailService.gmail ? 'connected' : 'disconnected',
        stats: this.stats,
        uptime: process.uptime()
      });
    });

    // Keep-alive endpoint (lightweight)
    this.app.get('/ping', (req, res) => {
      res.status(200).send('pong');
    });

    // Stats endpoint
    this.app.get('/stats', async (req, res) => {
      try {
        const dbStats = await databaseService.getTransactionStats();
        res.json({
          ...this.stats,
          database: dbStats
        });
      } catch (error) {
        logger.error('Failed to get stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });

    // Recent transactions endpoint
    this.app.get('/transactions/recent', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const transactions = await databaseService.getRecentTransactions(limit);
        res.json(transactions);
      } catch (error) {
        logger.error('Failed to get recent transactions:', error);
        res.status(500).json({ error: 'Failed to get transactions' });
      }
    });

    // Manual trigger endpoint (for testing)
    this.app.post('/trigger', async (req, res) => {
      if (this.isProcessing) {
        return res.status(429).json({ error: 'Already processing' });
      }

      try {
        await this.processEmails();
        res.json({ message: 'Processing completed', stats: this.stats });
      } catch (error) {
        logger.error('Manual trigger failed:', error);
        res.status(500).json({ error: 'Processing failed' });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((error, req, res, next) => {
      logger.error('Express error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  startCronJob() {
    // Chạy mỗi 10 giây
    const schedule = process.env.CRON_SCHEDULE || '*/10 * * * * *';

    this.cronJob = cron.schedule(schedule, async () => {
      if (!this.isProcessing) {
        await this.processEmails();
      } else {
        logger.warn('Previous processing still running, skipping...');
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Keep-alive job - ping chính nó mỗi 5 phút để tránh sleep
    if (process.env.NODE_ENV === 'production') {
      cron.schedule('*/5 * * * *', async () => {
        try {
          const http = require('http');
          const options = {
            hostname: 'localhost',
            port: this.port,
            path: '/health',
            method: 'GET',
            timeout: 5000
          };

          const req = http.request(options, (res) => {
            logger.debug('Keep-alive ping successful');
          });

          req.on('error', (err) => {
            logger.debug('Keep-alive ping failed:', err.message);
          });

          req.end();
        } catch (error) {
          logger.debug('Keep-alive error:', error.message);
        }
      }, {
        scheduled: true,
        timezone: "Asia/Ho_Chi_Minh"
      });
    }

    logger.info(`Cron job started with schedule: ${schedule}`);
  }

  async processEmails() {
    if (this.isProcessing) {
      logger.warn('Email processing already in progress');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    try {
      logger.info('Starting email processing...');

      // Lấy historyId cuối cùng
      const lastHistoryId = await databaseService.getLastHistoryId();
      logger.info(`Last historyId: ${lastHistoryId || 'none'}`);

      // Lấy emails mới
      const emails = await gmailService.getEmailsSinceHistory(lastHistoryId);

      // Nếu lần đầu chạy và không có email để xử lý
      if (!lastHistoryId && emails.length === 0) {
        logger.info('First time setup - getting latest historyId...');
        const latestHistoryId = await gmailService.getLatestHistoryId();
        if (latestHistoryId) {
          await databaseService.updateHistoryId(latestHistoryId, 0);
          logger.info(`Initial historyId saved: ${latestHistoryId}`);
        }
        return;
      }

      if (emails.length === 0) {
        logger.info('No new emails found');
        return;
      }

      logger.info(`Found ${emails.length} new emails to process`);

      // Xử lý từng email
      for (const email of emails) {
        try {
          processedCount++;

          // Parse thông tin giao dịch
          const transactionData = emailParser.parseTransactionEmail(email.htmlContent);

          // Bỏ qua giao dịch chuyển đi (số âm)
          if (transactionData && !(typeof transactionData.soTienNumber === 'number' && transactionData.soTienNumber < 0)) {
            // Lưu vào database
            const savedTransaction = await databaseService.saveTransaction(
              transactionData,
              email.id,
              email.historyId
            );

            if (savedTransaction) {
              successCount++;
              logger.info(`Transaction processed: ${transactionData.maGiaoDich}`);
            }
          } else if (transactionData && transactionData.soTienNumber < 0) {
            logger.info(`Skipping outgoing transfer (negative amount): ${transactionData.maGiaoDich}`);
          } else {
            logger.warn(`Failed to parse transaction from email: ${email.id}`);
            errorCount++;
          }

        } catch (error) {
          logger.error(`Error processing email ${email.id}:`, error);
          errorCount++;
        }
      }

      // Cập nhật historyId mới nhất
      if (emails.length > 0) {
        const latestHistoryId = emails[emails.length - 1].historyId;
        await databaseService.updateHistoryId(latestHistoryId, emails.length);
      } else if (!lastHistoryId) {
        // Nếu không có email và không có historyId, lấy historyId hiện tại
        const currentHistoryId = await gmailService.getLatestHistoryId();
        if (currentHistoryId) {
          await databaseService.updateHistoryId(currentHistoryId, 0);
          logger.info(`Updated to current historyId: ${currentHistoryId}`);
        }
      }

      // Cập nhật stats
      this.stats.totalProcessed += processedCount;
      this.stats.successCount += successCount;
      this.stats.errorCount += errorCount;
      this.stats.lastProcessTime = new Date().toISOString();

      const processingTime = Date.now() - startTime;
      logger.info(`Email processing completed: ${successCount}/${processedCount} successful in ${processingTime}ms`);

    } catch (error) {
      logger.error('Email processing failed:', error);
      this.stats.errorCount++;
    } finally {
      this.isProcessing = false;
    }
  }

  async start() {
    try {
      await this.initialize();

      this.app.listen(this.port, () => {
        logger.info(`Banking Notification App running on port ${this.port}`);
        logger.info(`Health check: http://localhost:${this.port}/health`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      logger.error('Failed to start app:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down gracefully...');

    if (this.cronJob) {
      this.cronJob.stop();
    }

    await database.disconnect();
    process.exit(0);
  }
}

// Khởi chạy ứng dụng
const app = new BankingNotificationApp();
app.start().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});
