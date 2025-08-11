const mongoose = require('mongoose');

const gmailHistorySchema = new mongoose.Schema({
  historyId: {
    type: String,
    required: true
  },
  lastProcessedAt: {
    type: Date,
    default: Date.now
  },
  emailCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'gmail_history'
});

// Index để tối ưu query
gmailHistorySchema.index({ historyId: 1 });
gmailHistorySchema.index({ isActive: 1 });
gmailHistorySchema.index({ lastProcessedAt: -1 });

module.exports = mongoose.model('GmailHistory', gmailHistorySchema);
