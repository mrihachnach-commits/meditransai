import { getAuth } from "firebase-admin/auth";
import { getAdminApp, firestoreRest } from "../../lib/firebaseAdmin.js";
import { checkAdmin } from "../../lib/utils.js";
import type { CustomRequest } from "../../lib/firebaseAdmin.js";

export default async function handler(req: CustomRequest, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await checkAdmin(req);
    
    const { uid, email } = req.body;
    console.log(`[Server] Admin delete-user request for ${email} (${uid})`);
    
    let authDeleted = false;
    const { app: currentAdminApp, isFullAdmin } = getAdminApp();
    
    if (currentAdminApp && isFullAdmin) {
      try {
        console.log(`[Server] Deleting user ${uid} from Firebase Auth...`);
        await getAuth(currentAdminApp).deleteUser(uid);
        console.log(`[Server] User ${uid} deleted from Firebase Auth.`);
        authDeleted = true;
      } catch (ae: any) {
        console.error(`[Server] Error deleting user from Auth: ${ae.message}`);
        if (ae.code === 'auth/user-not-found') {
          authDeleted = true; 
        } else {
          throw { status: 500, error: `Lỗi xóa tài khoản khỏi Authentication: ${ae.message}` };
        }
      }
    } else if (currentAdminApp && !isFullAdmin) {
      console.warn("[Server] Delete attempt skipped: Admin SDK initialized without Service Account.");
      // We might want to allow failing gracefully or throwing error
      throw { status: 500, error: "Hành động này yêu cầu Service Account. Vui lòng cấu hình FIREBASE_CLIENT_EMAIL và FIREBASE_PRIVATE_KEY trong Secrets." };
    } else {
      throw { status: 500, error: "Admin SDK chưa được cấu hình." };
    }
    
    await firestoreRest.deleteDoc("users", uid, req.idToken);
    
    if (email) {
      await firestoreRest.setDoc("blacklist", email.toLowerCase(), {
        email: email.toLowerCase(),
        uid: uid,
        reason: "Deleted by admin",
        createdAt: new Date().toISOString()
      }, req.idToken);
    }
    
    return res.status(200).json({ success: true, authDeleted });
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.error || err.message, details: err.details });
  }
}
