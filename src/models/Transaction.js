const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Thông tin tài khoản
  taiKhoanNhan: {
    type: String,
    required: true,
    trim: true
  },
  taiKhoanChuyen: {
    type: String,
    required: true,
    trim: true
  },
  tenNguoiChuyen: {
    type: String,
    required: true,
    trim: true
  },
  nganHangChuyen: {
    type: String,
    required: true,
    trim: true
  },

  // Thông tin giao dịch
  loaiGiaoDich: {
    type: String,
    required: true,
    trim: true
  },
  maGiaoDich: {
    type: String,
    required: true,
    trim: true
  },
  ngayGioGiaoDich: {
    type: Date,
    required: true
  },
  soTien: {
    type: String,
    required: true,
    trim: true
  },
  soTienNumber: {
    type: Number,
    required: true
  },
  phiGiaoDich: {
    type: String,
    required: true,
    trim: true
  },
  phiGiaoDichNumber: {
    type: Number,
    default: 0
  },
  noiDungGiaoDich: {
    type: String,
    required: true,
    trim: true
  },

  // Metadata
  emailId: {
    type: String,
    required: true
  },
  historyId: {
    type: String,
    required: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'transactions'
});

// Index để tối ưu query
transactionSchema.index({ maGiaoDich: 1 });
transactionSchema.index({ emailId: 1 });
transactionSchema.index({ ngayGioGiaoDich: -1 });
transactionSchema.index({ processedAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
