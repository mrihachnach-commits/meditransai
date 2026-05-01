import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "../../lib/firebaseAdmin.js";
import { checkAdmin } from "../../lib/utils.js";
import type { CustomRequest } from "../../lib/firebaseAdmin.js";

export default async function handler(req: CustomRequest, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await checkAdmin(req);
    
    const { uid, newPassword, email } = req.body;
    if (!uid || !newPassword) return res.status(400).json({ error: "UID và mật khẩu mới là bắt buộc" });

    const { app: currentAdminApp, isFullAdmin } = getAdminApp();
    if (currentAdminApp && isFullAdmin) {
      console.log(`[Server] Admin changing password for user ${uid} (${email})...`);
      await getAuth(currentAdminApp).updateUser(uid, { password: newPassword });
      return res.status(200).json({ success: true });
    } else {
      throw { status: 500, error: "Hành động này yêu cầu Service Account. Vui lòng cấu hình FIREBASE_CLIENT_EMAIL và FIREBASE_PRIVATE_KEY." };
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.error || err.message, details: err.details });
  }
}
