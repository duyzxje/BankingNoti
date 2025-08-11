# Banking Notification System

Hệ thống backend tự động xử lý Gmail API để trích xuất thông tin giao dịch ngân hàng và lưu trữ vào MongoDB Atlas.

## Tính năng

- ✅ Tự động gọi Gmail API mỗi 10 giây
- ✅ Sử dụng historyId để tránh xử lý trùng lặp email
- ✅ Phân tích HTML email để trích xuất thông tin giao dịch
- ✅ Lưu trữ vào MongoDB Atlas với 2 collections: `transactions` và `gmail_history`
- ✅ API endpoints để monitoring và xem dữ liệu
- ✅ Tối ưu cho Fly.io free tier

## Cài đặt

1. Clone repository:
```bash
git clone <repository-url>
cd banking-noti
```

2. Cài đặt dependencies:
```bash
npm install
```

3. Cấu hình environment variables trong file `.env`:
```env
MONGODB_URI=mongodb+srv://...
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
PORT=3000
```

4. Chạy ứng dụng:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Kiểm tra trạng thái hệ thống

### Statistics
```
GET /stats
```
Xem thống kê xử lý email và giao dịch

### Recent Transactions
```
GET /transactions/recent?limit=10
```
Lấy danh sách giao dịch gần đây

### Manual Trigger
```
POST /trigger
```
Kích hoạt xử lý email thủ công (dùng để test)

## Cấu trúc dữ liệu

### Transaction Collection
```javascript
{
  taiKhoanNhan: String,
  taiKhoanChuyen: String,
  tenNguoiChuyen: String,
  nganHangChuyen: String,
  loaiGiaoDich: String,
  maGiaoDich: String, // unique
  ngayGioGiaoDich: Date,
  soTien: String,
  soTienNumber: Number,
  phiGiaoDich: String,
  phiGiaoDichNumber: Number,
  noiDungGiaoDich: String,
  emailId: String, // unique
  historyId: String,
  processedAt: Date
}
```

### Gmail History Collection
```javascript
{
  historyId: String, // unique
  lastProcessedAt: Date,
  emailCount: Number,
  isActive: Boolean
}
```

## Deployment trên Fly.io

1. Cài đặt Fly CLI
2. Tạo file `fly.toml` (xem file mẫu)
3. Deploy:
```bash
fly deploy
```

## Monitoring

- Logs: `fly logs`
- Health check: `https://your-app.fly.dev/health`
- Stats: `https://your-app.fly.dev/stats`

## Tối ưu hóa

- Connection pooling giới hạn cho MongoDB
- Memory-efficient HTML parsing
- Error handling và retry logic
- Automatic cleanup dữ liệu cũ
- Optimized indexes cho database queries
