# Hướng dẫn cấu hình Vercel cho MediTrans AI

Nếu bạn đang gặp lỗi "Không đúng API" hoặc "Hành động yêu cầu Service Account" trên Vercel, hãy làm theo các bước sau:

## 1. Cấu hình Environment Variables trên Vercel

Truy cập **Vercel Dashboard > Project Settings > Environment Variables** và thêm các biến sau:

### Firebase Client (Web) - Cần thiết cho Login & Tra cứu
- `FIREBASE_API_KEY`: Lấy từ `firebase-applet-config.json` (phần `apiKey`).
- `FIREBASE_AUTH_DOMAIN`: Lấy từ `firebase-applet-config.json` (phần `authDomain`).
- `FIREBASE_PROJECT_ID`: Lấy từ `firebase-applet-config.json` (phần `projectId`).
- `FIREBASE_FIRESTORE_DATABASE_ID`: Lấy từ `firebase-applet-config.json` (phần `firestoreDatabaseId`).

### Firebase Admin (Service Account) - Cần thiết cho Quản trị viên (Admin Panel)
- `FIREBASE_CLIENT_EMAIL`: Email của Service Account (thường có đuôi `@...iam.gserviceaccount.com`).
- `FIREBASE_PRIVATE_KEY`: Private Key của Service Account.
  - **RẤT QUAN TRỌNG**: Khi copy từ file JSON, hãy copy toàn bộ giá trị trong dấu ngoặc kép (bao gồm cả `-----BEGIN PRIVATE KEY-----` và `-----END PRIVATE KEY-----`).
  - Đừng lo lắng về các ký tự `\n`, code của ứng dụng đã được thiết kế để tự động xử lý chúng.
  - **Mẹo**: Nếu bạn dán vào Vercel mà nó tự động thêm dấu ngoặc kép ở đầu và cuối, code cũng sẽ tự động loại bỏ chúng.

### Biến thay thế (Nếu các biến trên vẫn lỗi)
Nếu bạn thấy việc cấu hình từng biến lẻ quá khó khăn, bạn có thể tạo một biến duy nhất:
- `FIREBASE_SERVICE_ACCOUNT`: Dán **toàn bộ nội dung file JSON** của Service Account vào đây. Ứng dụng sẽ ưu tiên sử dụng biến này.
- `VITE_GEMINI_API_KEY`: API Key để dịch thuật (Lưu ý: Phải có tiền tố `VITE_` để phía Client có thể đọc được). Bạn có thể nhập nhiều Key phân cách bằng dấu phẩy để tự động xoay vòng.

## 2. Thêm Domain vào Authorized Domains

Để tính năng Đăng nhập hoạt động trên Vercel, bạn cần thêm domain của mình vào Firebase:
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Chọn project **medi-f7a26**.
3. Vào **Authentication > Settings > Authorized domains**.
4. Nhấn **Add domain** và nhập domain Vercel của bạn (ví dụ: `your-app.vercel.app`).

## 3. Tại sao Preview chạy mà Vercel không chạy?

1. **Domain Authorization**: Firebase chỉ cho phép đăng nhập từ các domain đã được khai báo.
2. **Environment Variables**: Trong môi trường Preview (AI Studio), các biến này đã được hệ thống tự động cấu hình, nhưng trên Vercel bạn phải tự tay nhập vào Dashboard.
3. **API Routing**: File `vercel.json` đã được cập nhật để cho phép truy cập trực tiếp vào các folder con như `/api/admin/`.
