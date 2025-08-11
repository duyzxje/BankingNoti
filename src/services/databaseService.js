const Transaction = require('../models/Transaction');
const GmailHistory = require('../models/GmailHistory');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Khởi tạo database service
   */
  async initialize() {
    try {
      // Tạo indexes nếu chưa có
      await this.createIndexes();
      this.isInitialized = true;
      logger.info('Database service initialized');
    } catch (error) {
      logger.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  /**
   * Tạo indexes cho collections
   */
  async createIndexes() {
    try {
      // Indexes cho Transaction collection
      await Transaction.collection.createIndex({ maGiaoDich: 1 }, { unique: true });
      await Transaction.collection.createIndex({ emailId: 1 }, { unique: true });
      await Transaction.collection.createIndex({ ngayGioGiaoDich: -1 });

      // Indexes cho GmailHistory collection
      await GmailHistory.collection.createIndex({ historyId: 1 }, { unique: true });
      await GmailHistory.collection.createIndex({ isActive: 1 });

      logger.info('Database indexes created successfully');
    } catch (error) {
      // Ignore error nếu index đã tồn tại
      if (error.code !== 11000) {
        logger.error('Failed to create indexes:', error);
      }
    }
  }

  /**
   * Lưu transaction vào database
   * @param {Object} transactionData - Dữ liệu giao dịch
   * @param {string} emailId - ID của email
   * @param {string} historyId - History ID của email
   * @returns {Object} Transaction đã lưu
   */
  async saveTransaction(transactionData, emailId, historyId) {
    try {
      // Kiểm tra xem transaction đã tồn tại chưa
      const existingTransaction = await Transaction.findOne({
        $or: [
          { maGiaoDich: transactionData.maGiaoDich },
          { emailId: emailId }
        ]
      });

      if (existingTransaction) {
        logger.info(`Transaction already exists: ${transactionData.maGiaoDich}`);
        return existingTransaction;
      }

      // Tạo transaction mới
      const transaction = new Transaction({
        ...transactionData,
        emailId: emailId,
        historyId: historyId,
        ngayGioGiaoDich: transactionData.ngayGioGiaoDichDate || new Date(),
        soTienNumber: transactionData.soTienNumber || 0,
        phiGiaoDichNumber: transactionData.phiGiaoDichNumber || 0
      });

      const savedTransaction = await transaction.save();
      logger.info(`Transaction saved: ${savedTransaction.maGiaoDich}`);

      return savedTransaction;

    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error
        logger.warn(`Duplicate transaction detected: ${transactionData.maGiaoDich}`);
        return null;
      }

      logger.error('Failed to save transaction:', error);
      throw error;
    }
  }

  /**
   * Lấy historyId cuối cùng đã xử lý
   * @returns {string|null} HistoryId cuối cùng hoặc null nếu chưa có
   */
  async getLastHistoryId() {
    try {
      // Bước 1: Kiểm tra gmail_history collection
      const lastHistory = await GmailHistory.findOne();

      if (lastHistory) {
        logger.info(`Found historyId in gmail_history: ${lastHistory.historyId}`);
        return lastHistory.historyId;
      }

      // Bước 2: Nếu gmail_history trống, kiểm tra transactions collection
      logger.info('gmail_history is empty, checking transactions collection...');
      const lastTransaction = await Transaction.findOne()
        .sort({ processedAt: -1 })
        .limit(1);

      if (lastTransaction && lastTransaction.historyId) {
        logger.info(`Found historyId in transactions: ${lastTransaction.historyId}`);

        // Khôi phục historyId vào gmail_history
        await this.updateHistoryId(lastTransaction.historyId, 0);
        logger.info('Restored historyId from transactions to gmail_history');

        return lastTransaction.historyId;
      }

      // Bước 3: Cả hai collection đều trống
      logger.info('Both gmail_history and transactions are empty, need to get latest email');
      return null;

    } catch (error) {
      logger.error('Failed to get last historyId:', error);
      throw error;
    }
  }

  /**
   * Cập nhật historyId mới nhất
   * @param {string} historyId - HistoryId mới
   * @param {number} emailCount - Số lượng email đã xử lý
   * @returns {Object} GmailHistory đã cập nhật
   */
  async updateHistoryId(historyId, emailCount = 0) {
    try {
      // Xóa tất cả historyId cũ
      await GmailHistory.deleteMany({});
      logger.info('Deleted all old historyId records');

      // Tạo historyId mới
      const history = new GmailHistory({
        historyId: historyId,
        lastProcessedAt: new Date(),
        emailCount: emailCount,
        isActive: true
      });

      const savedHistory = await history.save();
      logger.info(`HistoryId updated: ${historyId} (${emailCount} emails)`);

      return savedHistory;

    } catch (error) {
      logger.error('Failed to update historyId:', error);
      throw error;
    }
  }

  /**
   * Lấy thống kê transactions
   * @returns {Object} Thống kê
   */
  async getTransactionStats() {
    try {
      const totalTransactions = await Transaction.countDocuments();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayTransactions = await Transaction.countDocuments({
        processedAt: { $gte: todayStart }
      });

      const lastTransaction = await Transaction.findOne()
        .sort({ processedAt: -1 })
        .limit(1);

      return {
        totalTransactions,
        todayTransactions,
        lastTransactionTime: lastTransaction ? lastTransaction.processedAt : null
      };

    } catch (error) {
      logger.error('Failed to get transaction stats:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách transactions gần đây
   * @param {number} limit - Số lượng transactions
   * @returns {Array} Danh sách transactions
   */
  async getRecentTransactions(limit = 10) {
    try {
      const transactions = await Transaction.find()
        .sort({ processedAt: -1 })
        .limit(limit)
        .select('maGiaoDich soTien tenNguoiChuyen ngayGioGiaoDich processedAt');

      return transactions;
    } catch (error) {
      logger.error('Failed to get recent transactions:', error);
      throw error;
    }
  }

  /**
   * Xóa dữ liệu cũ để tiết kiệm storage
   * @param {number} daysToKeep - Số ngày muốn giữ lại
   */
  async cleanupOldData(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Xóa transactions cũ
      const deletedTransactions = await Transaction.deleteMany({
        processedAt: { $lt: cutoffDate }
      });

      // Không cần xóa history vì chỉ có 1 record duy nhất

      logger.info(`Cleanup completed: ${deletedTransactions.deletedCount} transactions deleted`);

    } catch (error) {
      logger.error('Failed to cleanup old data:', error);
    }
  }
}

module.exports = new DatabaseService();
