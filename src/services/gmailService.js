const gmailConfig = require('../config/gmail');
const logger = require('../utils/logger');

class GmailService {
  constructor() {
    this.gmail = null;
  }

  async initialize() {
    try {
      await gmailConfig.initialize();
      this.gmail = gmailConfig.getGmailClient();
      logger.info('Gmail service initialized');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách email dựa trên historyId
   * @param {string} startHistoryId - History ID để bắt đầu lấy email
   * @returns {Array} Danh sách email mới
   */
  async getEmailsSinceHistory(startHistoryId = null) {
    try {
      let query = 'from:no-reply@cake.vn';
      let emails = [];

      if (startHistoryId) {
        try {
          // Sử dụng history API để lấy email mới
          const historyResponse = await this.gmail.users.history.list({
            userId: 'me',
            startHistoryId: startHistoryId,
            historyTypes: ['messageAdded'],
            maxResults: 100
          });

          if (historyResponse.data.history) {
            const messageIds = [];
            historyResponse.data.history.forEach(historyItem => {
              if (historyItem.messagesAdded) {
                historyItem.messagesAdded.forEach(messageAdded => {
                  messageIds.push(messageAdded.message.id);
                });
              }
            });

            // Lấy chi tiết từng email
            for (const messageId of messageIds) {
              try {
                const email = await this.getEmailDetails(messageId);
                if (email && this.isBankingEmail(email)) {
                  emails.push(email);
                }
              } catch (error) {
                logger.error(`Failed to get email details for ${messageId}:`, error);
              }
            }
          }
        } catch (historyError) {
          // Nếu historyId hết hạn (404), reset và lấy email mới nhất
          if (historyError.code === 404) {
            logger.warn(`HistoryId ${startHistoryId} expired, resetting to latest email...`);
            return await this.getEmailsSinceHistory(null); // Gọi lại không có historyId
          }
          throw historyError;
        }
      } else {
        // Lần đầu tiên, chỉ lấy email mới nhất để có historyId
        logger.info('First time running, getting latest email for historyId...');

        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 1 // Chỉ lấy 1 email mới nhất
        });

        if (response.data.messages && response.data.messages.length > 0) {
          try {
            const latestEmail = await this.getEmailDetails(response.data.messages[0].id);
            if (latestEmail) {
              logger.info(`Got latest email historyId: ${latestEmail.historyId}`);
              // Không xử lý email này, chỉ lấy historyId để làm điểm bắt đầu
              // Email này sẽ được xử lý trong lần chạy tiếp theo nếu có email mới hơn
              return []; // Trả về mảng rỗng, không xử lý email lần đầu
            }
          } catch (error) {
            logger.error(`Failed to get latest email details:`, error);
          }
        } else {
          logger.info('No emails found in mailbox');
        }
      }

      logger.info(`Found ${emails.length} banking emails`);
      return emails;

    } catch (error) {
      logger.error('Failed to get emails:', error);

      // Thử refresh token nếu lỗi authentication
      if (error.code === 401) {
        try {
          await gmailConfig.refreshAccessToken();
          logger.info('Retrying after token refresh...');
          return await this.getEmailsSinceHistory(startHistoryId);
        } catch (refreshError) {
          logger.error('Failed to refresh token:', refreshError);
        }
      }

      throw error;
    }
  }

  /**
   * Lấy chi tiết email theo ID
   * @param {string} messageId - ID của email
   * @returns {Object} Chi tiết email
   */
  async getEmailDetails(messageId) {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;

      // Lấy thông tin cơ bản
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Lấy nội dung HTML
      const htmlContent = this.extractHtmlContent(message.payload);

      return {
        id: messageId,
        historyId: message.historyId,
        subject,
        from,
        date,
        htmlContent,
        receivedTime: new Date(parseInt(message.internalDate))
      };

    } catch (error) {
      logger.error(`Failed to get email details for ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Trích xuất nội dung HTML từ email payload
   * @param {Object} payload - Email payload
   * @returns {string} HTML content
   */
  extractHtmlContent(payload) {
    let htmlContent = '';

    if (payload.parts) {
      // Email có nhiều parts
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body.data) {
          htmlContent += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Recursive cho nested parts
          htmlContent += this.extractHtmlContent(part);
        }
      }
    } else if (payload.mimeType === 'text/html' && payload.body.data) {
      // Email đơn giản chỉ có HTML
      htmlContent = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    return htmlContent;
  }

  /**
   * Kiểm tra xem email có phải là email banking không
   * @param {Object} email - Email object
   * @returns {boolean} True nếu là banking email
   */
  isBankingEmail(email) {
    const bankingKeywords = [
      'giao dịch',
      'chuyển tiền',
      'tài khoản',
      'số tiền',
      'ngân hàng',
      'transaction',
      'banking'
    ];

    const content = (email.subject + ' ' + email.htmlContent).toLowerCase();
    return bankingKeywords.some(keyword => content.includes(keyword));
  }

  /**
   * Lấy historyId mới nhất
   * @returns {string} Latest historyId
   */
  async getLatestHistoryId() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });

      return response.data.historyId;
    } catch (error) {
      logger.error('Failed to get latest historyId:', error);
      throw error;
    }
  }
}

module.exports = new GmailService();
