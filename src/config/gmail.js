const { google } = require('googleapis');
const logger = require('../utils/logger');

class GmailConfig {
  constructor() {
    this.oauth2Client = null;
    this.gmail = null;
    this.isAuthenticated = false;
  }

  async initialize() {
    try {
      // Tạo OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      // Set refresh token
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      // Tạo Gmail API client
      this.gmail = google.gmail({ 
        version: 'v1', 
        auth: this.oauth2Client 
      });

      // Test authentication
      await this.testAuthentication();
      
      this.isAuthenticated = true;
      logger.info('Gmail API initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Gmail API:', error);
      this.isAuthenticated = false;
      throw error;
    }
  }

  async testAuthentication() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });
      
      logger.info(`Gmail authenticated for: ${response.data.emailAddress}`);
      return true;
    } catch (error) {
      logger.error('Gmail authentication test failed:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      logger.info('Gmail access token refreshed');
      return true;
    } catch (error) {
      logger.error('Failed to refresh Gmail access token:', error);
      throw error;
    }
  }

  getGmailClient() {
    if (!this.isAuthenticated || !this.gmail) {
      throw new Error('Gmail API not initialized or not authenticated');
    }
    return this.gmail;
  }

  getAuthenticationStatus() {
    return this.isAuthenticated;
  }
}

module.exports = new GmailConfig();
