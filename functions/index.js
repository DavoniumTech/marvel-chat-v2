
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const DEFAULT_ICON = "https://devonim.github.io/marvel-chat-v2/assets/icon-192.png";
const DEFAULT_URL = "https://devonim.github.io/marvel-chat-v2/";

/**
 * Helper to dispatch FCM multicast messages to all active push tokens for a given user UID.
 */
async function sendPushToUser(recipientUid, title, body, targetUrl, entityId, type) {
  if (!recipientUid) return;

  const tokensSnapshot = await admin.firestore()
    .collection(`users/${recipientUid}/pushTokens`)
    .where("active", "==", true)
    .get();

  if (tokensSnapshot.empty) return;

  const tokens = [];
  const tokenDocRefs = [];

  tokensSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data && data.token) {
      tokens.push(data.token);
      tokenDocRefs.push(docSnap.ref);
    }
  });

  if (tokens.length === 0) return;

  const messagePayload = {
    tokens: tokens,
    notification: {
      title: title,
      body: body,
      icon: DEFAULT_ICON
    },
    data: {
      type: type || "SYSTEM",
      targetUrl: targetUrl || DEFAULT_URL,
      entityId: entityId || ""
    },
    webpush: {
      fcmOptions: {
        link: targetUrl || DEFAULT_URL
      }
    }
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    
    // Handle invalid/unregistered tokens cleanup
    if (response.failureCount > 0) {
      const badTokenDeletions = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            badTokenDeletions.push(tokenDocRefs[idx].update({ active: false }));
          }
        }
      });
      if (badTokenDeletions.length > 0) {
        await Promise.all(badTokenDeletions);
      }
    }
  } catch (error) {
    console.error("Error sending FCM multicast:", error);
  }
}

/**
 * 1. PRIVATE MESSAGE NOTIFICATION TRIGGER
 */
exports.onMessageCreated = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const message = snap.data();
    const conversationId = event.params.conversationId;

    const senderUid = message.uid;
    if (!senderUid) return;

    const convRef = admin.firestore().collection("conversations").doc(conversationId);
    const convSnap = await convRef.get();
    if (!convSnap.exists) return;

    const convData = convSnap.data();
    const participants = convData.participants || [];
    const recipientUid = participants.find(uid => uid !== senderUid);

    if (!recipientUid) return;

    await sendPushToUser(
      recipientUid,
      "New Message",
      "You received a new private message.",
      DEFAULT_URL,
      conversationId,
      "MESSAGE"
    );
  }
);

/**
 * 2. POST LIKE SUBCOLLECTION NOTIFICATION TRIGGER
 * Matches confirmed schema: posts/{postId}/likes/{uid}
 */
exports.onPostLikeSubcollectionCreated = onDocumentCreated(
  "posts/{postId}/likes/{uid}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const postId = event.params.postId;
    const likerUid = event.params.uid;

    const postRef = admin.firestore().collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) return;

    const postData = postSnap.data();
    const postOwnerUid = postData.uid;

    if (!postOwnerUid) return;
    if (likerUid === postOwnerUid) return; // Do not notify self

    await sendPushToUser(
      postOwnerUid,
      "New Like",
      "Someone liked your post.",
      DEFAULT_URL,
      postId,
      "LIKE"
    );
  }
);

/**
 * 3. POST COMMENT NOTIFICATION TRIGGER
 * Matches confirmed schema: posts/{postId}/comments/{commentId} containing { uid, username, text, createdAt }.
 */
exports.onCommentCreated = onDocumentCreated(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const comment = snap.data();
    const postId = event.params.postId;

    const commenterUid = comment.uid;
    if (!commenterUid) return;

    const postRef = admin.firestore().collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) return;

    const postData = postSnap.data();
    const postOwnerUid = postData.uid;

    if (!postOwnerUid) return;
    if (commenterUid === postOwnerUid) return; // Do not notify self

    await sendPushToUser(
      postOwnerUid,
      "New Comment",
      "Someone commented on your post.",
      DEFAULT_URL,
      postId,
      "COMMENT"
    );
  }
);

/**
 * 4. SECURE ADMIN ANNOUNCEMENT TRIGGER
 * Requires valid Firebase ID token and `admin === true` custom claim.
 */
exports.sendAdminAnnouncement = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send("Unauthorized: Missing or invalid token.");
    }

    const token = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      if (!decodedToken.admin) {
        return res.status(403).send("Forbidden: Administrator privileges required.");
      }

      const { title, body, targetUrl } = req.body || {};
      if (!title || !body) {
        return res.status(400).send("Bad Request: Title and body are required.");
      }

      const tokensSnap = await admin.firestore().collectionGroup("pushTokens").where("active", "==", true).get();
      const tokens = [];
      tokensSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d && d.token) tokens.push(d.token);
      });

      if (tokens.length === 0) {
        return res.status(200).json({ success: true, sentCount: 0 });
      }

      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        notification: {
          title: title,
          body: body,
          icon: DEFAULT_ICON
        },
        data: {
          type: "ANNOUNCEMENT",
          targetUrl: targetUrl || DEFAULT_URL
        }
      });

      return res.status(200).json({
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      });
    } catch (error) {
      console.error("Announcement error:", error);
      return res.status(500).send("Internal Server Error: " + error.message);
    }
  }
);
