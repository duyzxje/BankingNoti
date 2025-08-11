const cheerio = require('cheerio');
const logger = require('../utils/logger');

class EmailParser {
  constructor() {
    // Mapping các trường dữ liệu với các pattern có thể có
    this.fieldMappings = {
      taiKhoanNhan: ['Tài khoản nhận', 'Tai khoan nhan'],
      taiKhoanChuyen: ['Tài khoản chuyển', 'Tai khoan chuyen'],
      tenNguoiChuyen: ['Tên người chuyển', 'Ten nguoi chuyen'],
      nganHangChuyen: ['Ngân hàng chuyển', 'Ngan hang chuyen'],
      loaiGiaoDich: ['Loại giao dịch', 'Loai giao dich'],
      maGiaoDich: ['Mã giao dịch', 'Ma giao dich'],
      ngayGioGiaoDich: ['Ngày giờ giao dịch', 'Ngay gio giao dich'],
      soTien: ['Số tiền', 'So tien'],
      phiGiaoDich: ['Phí giao dịch', 'Phi giao dich'],
      noiDungGiaoDich: ['Nội dung giao dịch', 'Noi dung giao dich']
    };
  }

  /**
   * Parse HTML email để trích xuất thông tin giao dịch
   * @param {string} htmlContent - HTML content của email
   * @returns {Object} Thông tin giao dịch đã parse
   */
  parseTransactionEmail(htmlContent) {
    try {
      const $ = cheerio.load(htmlContent);
      const transactionData = {};

      // Tìm tất cả các table cells chứa thông tin
      $('td').each((index, element) => {
        const cellText = $(element).text().trim();

        // Kiểm tra xem cell này có chứa label không
        for (const [field, patterns] of Object.entries(this.fieldMappings)) {
          for (const pattern of patterns) {
            if (cellText.includes(pattern)) {
              // Tìm cell tiếp theo chứa giá trị
              const valueCell = this.findValueCell($, element, pattern);
              if (valueCell) {
                transactionData[field] = this.cleanValue(valueCell, field);
                break;
              }
            }
          }
        }
      });

      // Validate và format dữ liệu
      const validatedData = this.validateAndFormatData(transactionData);

      if (this.isValidTransaction(validatedData)) {
        logger.info('Successfully parsed transaction data');
        return validatedData;
      } else {
        logger.warn('Parsed data is not a valid transaction');
        return null;
      }

    } catch (error) {
      logger.error('Failed to parse email HTML:', error);
      return null;
    }
  }

  /**
   * Tìm cell chứa giá trị tương ứng với label
   * @param {Object} $ - Cheerio instance
   * @param {Object} labelElement - Element chứa label
   * @param {string} pattern - Pattern đã match
   * @returns {string} Giá trị đã tìm thấy
   */
  findValueCell($, labelElement, pattern) {
    const $labelCell = $(labelElement);

    // Thử tìm trong cùng row
    const $row = $labelCell.closest('tr');
    const $valueCells = $row.find('td').not($labelCell);

    for (let i = 0; i < $valueCells.length; i++) {
      const cellText = $($valueCells[i]).text().trim();
      if (cellText && cellText !== pattern && !cellText.includes(pattern)) {
        return cellText;
      }
    }

    // Thử tìm trong row tiếp theo
    const $nextRow = $row.next('tr');
    if ($nextRow.length > 0) {
      const nextRowText = $nextRow.text().trim();
      if (nextRowText && !nextRowText.includes(pattern)) {
        return nextRowText;
      }
    }

    return null;
  }

  /**
   * Làm sạch và format giá trị
   * @param {string} value - Giá trị thô
   * @param {string} field - Tên trường
   * @returns {string} Giá trị đã được làm sạch
   */
  cleanValue(value, field) {
    if (!value) return '';

    let cleanedValue = value.trim();

    // Xử lý đặc biệt cho từng loại field
    switch (field) {
      case 'soTien':
      case 'phiGiaoDich':
        // Giữ nguyên format tiền tệ
        cleanedValue = cleanedValue.replace(/\s+/g, ' ');
        break;

      case 'ngayGioGiaoDich':
        // Chuẩn hóa format ngày giờ
        cleanedValue = cleanedValue.replace(/\s+/g, ' ');
        break;

      case 'maGiaoDich':
        // Chỉ giữ số và chữ
        cleanedValue = cleanedValue.replace(/[^\w]/g, '');
        break;

      default:
        // Xóa khoảng trắng thừa
        cleanedValue = cleanedValue.replace(/\s+/g, ' ');
        break;
    }

    return cleanedValue;
  }

  /**
   * Validate và format dữ liệu giao dịch
   * @param {Object} data - Dữ liệu thô
   * @returns {Object} Dữ liệu đã validate và format
   */
  validateAndFormatData(data) {
    const formatted = { ...data };

    // Parse số tiền
    if (formatted.soTien) {
      formatted.soTienNumber = this.parseAmount(formatted.soTien);
    }

    // Parse phí giao dịch
    if (formatted.phiGiaoDich) {
      formatted.phiGiaoDichNumber = this.parseAmount(formatted.phiGiaoDich);
    }

    // Parse ngày giờ
    if (formatted.ngayGioGiaoDich) {
      formatted.ngayGioGiaoDichDate = this.parseDateTime(formatted.ngayGioGiaoDich);
    }

    return formatted;
  }

  /**
   * Parse số tiền từ string
   * @param {string} amountStr - String chứa số tiền
   * @returns {number} Số tiền dạng number
   */
  parseAmount(amountStr) {
    if (!amountStr) return 0;

    // Xử lý dấu + và -
    const isPositive = !amountStr.includes('-');

    // Xóa tất cả ký tự không phải số và dấu chấm/phẩy
    let cleanAmount = amountStr.replace(/[^\d.,]/g, '');

    // Xử lý format tiền Việt Nam: "2.000" hoặc "2,000"
    // Nếu có dấu chấm hoặc phẩy ở giữa (phân cách hàng nghìn)
    if (cleanAmount.includes('.') || cleanAmount.includes(',')) {
      // Xóa dấu phân cách hàng nghìn (dấu chấm hoặc phẩy)
      cleanAmount = cleanAmount.replace(/[.,]/g, '');
    }

    const amount = parseInt(cleanAmount) || 0;
    return isPositive ? amount : -amount;
  }

  /**
   * Parse ngày giờ từ string
   * @param {string} dateTimeStr - String chứa ngày giờ
   * @returns {Date} Date object
   */
  parseDateTime(dateTimeStr) {
    if (!dateTimeStr) return new Date();

    try {
      // Format: "06/08/2025, 01:50:59"
      const [datePart, timePart] = dateTimeStr.split(', ');
      const [day, month, year] = datePart.split('/');
      const [hour, minute, second] = timePart.split(':');

      // Tạo ISO string để tránh timezone issues
      const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second || '0').padStart(2, '0')}.000+07:00`;

      return new Date(isoString);
    } catch (error) {
      logger.error('Failed to parse datetime:', dateTimeStr, error);
      return new Date();
    }
  }

  /**
   * Kiểm tra xem dữ liệu có phải là giao dịch hợp lệ không
   * @param {Object} data - Dữ liệu giao dịch
   * @returns {boolean} True nếu hợp lệ
   */
  isValidTransaction(data) {
    const requiredFields = [
      'taiKhoanNhan',
      'taiKhoanChuyen',
      'maGiaoDich',
      'soTien'
    ];

    return requiredFields.every(field => data[field] && data[field].toString().trim() !== '');
  }
}

module.exports = new EmailParser();
