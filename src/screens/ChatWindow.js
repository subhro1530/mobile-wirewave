import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
  Modal,
  Pressable,
  Image,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../AuthContext";
import API from "../api";
import Icon from "react-native-vector-icons/MaterialIcons";
import ChatWindow from "../components/ChatWindow";

const COLORS = {
  bar: "#14233a",
  bg: "#0b141a",
  bgInput: "#1f2c34",
  send: "#3a7afe",
  textPrimary: "#e9edef",
  textSecondary: "#8696a0",
};

export default function ChatWindowScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userEmail, userToken } = useContext(AuthContext);
  const contact = route.params?.contact;

  const [allMessages, setAllMessages] = useState([]);
  const [loadingSend, setLoadingSend] = useState(false);
  const [text, setText] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [emojiVisible, setEmojiVisible] = useState(false); // replaces showEmoji panel
  const [shareVisible, setShareVisible] = useState(false); // FIX: added missing state
  const [toast, setToast] = useState(null); // {msg,type}
  const [contactOnline, setContactOnline] = useState(false);
  const [contactLastSeen, setContactLastSeen] = useState(null);
  const toastRef = useRef(null);
  const chatRef = useRef(null);
  const authHdr = userToken
    ? { Authorization: `Bearer ${userToken}` }
    : undefined;
  const [enhancing, setEnhancing] = useState(false); // NEW

  const loadMessages = useCallback(async () => {
    try {
      const res = await API.get("/messages", { headers: authHdr });
      setAllMessages(res.data || []);
    } catch {
      /* silent */
    }
  }, [authHdr]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const conversation = allMessages.filter(
    (m) =>
      (m.sender_email === userEmail && m.receiver_email === contact) ||
      (m.receiver_email === userEmail && m.sender_email === contact)
  );

  // Mark read
  useEffect(() => {
    const unread = conversation.filter(
      (m) => m.receiver_email === userEmail && !m.read
    );
    if (!unread.length) return;
    (async () => {
      for (const m of unread) {
        try {
          await API.post(
            "/messages/read",
            { message_id: m.id },
            { headers: authHdr }
          );
        } catch {}
      }
      setAllMessages((prev) =>
        prev.map((p) =>
          unread.find((u) => u.id === p.id) ? { ...p, read: true } : p
        )
      );
    })();
  }, [conversation, userEmail, authHdr]);

  const sendMessage = useCallback(async () => {
    if (!text.trim() || !contact) return;
    setLoadingSend(true);
    try {
      const { data: created } = await API.post(
        "/messages",
        { receiver_email: contact, content: text.trim() },
        { headers: authHdr }
      );
      // Optimistic append so the user sees it immediately
      if (created && created.id) {
        setAllMessages((prev) => [...prev, created]);
      }
      setText("");
      // Also refresh from server to stay canonical
      await loadMessages();
      setTimeout(() => chatRef.current?.scrollToBottom?.(), 60);
    } catch (e) {
      // Surface server error
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        (e?.response?.status === 401
          ? "Unauthorized. Please login again."
          : "") ||
        e?.message ||
        "Failed to send";
      showToast(msg, "error");
    } finally {
      setLoadingSend(false);
    }
  }, [text, contact, loadMessages, authHdr]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardOffset(e.endCoordinates.height);
      setTimeout(() => chatRef.current?.scrollToBottom?.(), 80);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileVisible(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileData(null);
    try {
      const { data } = await API.get(
        `/users/search?email=${encodeURIComponent(contact)}`,
        { headers: authHdr }
      );
      // ensure at least email; preserve userid if present
      setProfileData(
        data &&
          (data.user_email ||
            data.userid ||
            data.name ||
            data.about ||
            data.avatar_url)
          ? {
              user_email: data.user_email || contact,
              userid: data.userid || null,
              ...data,
            }
          : { user_email: contact }
      );
    } catch (e) {
      if (e?.response?.status === 404) {
        setProfileData({ user_email: contact }); // minimal fallback
        setProfileError(null);
      } else {
        setProfileError(e.message);
      }
    } finally {
      setProfileLoading(false);
    }
  }, [contact, authHdr]);

  const deleteChat = useCallback(() => {
    Alert.alert("Delete Chat", `Delete chat with ${contact}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete(`/messages/${encodeURIComponent(contact)}`, {
              headers: authHdr,
            }); // CHANGED
          } catch {}
          navigation.goBack();
        },
      },
    ]);
  }, [contact, navigation, authHdr]);

  // Fetch avatar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await API.get(
          `/users/search?email=${encodeURIComponent(contact)}`,
          { headers: authHdr }
        );
        if (mounted && data?.avatar_url) setAvatarUrl(data.avatar_url);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [contact, authHdr]);

  const showToast = useCallback((msg, type = "success", duration = 2300) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  const largeEmojis = [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "🙃",
    "😉",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
    "😚",
    "😋",
    "😜",
    "🤪",
    "🤗",
    "🤫",
    "🤔",
    "🤨",
    "😐",
    "😑",
    "😶",
    "😏",
    "😒",
    "🙄",
    "😬",
    "🤥",
    "😌",
    "😴",
    "😪",
    "🤤",
    "😷",
    "🤒",
    "🤕",
    "🤢",
    "🤮",
    "🤧",
    "🥵",
    "🥶",
    "🥴",
    "😵",
    "🤯",
    "🤠",
    "🥳",
    "😎",
    "🤓",
    "🧐",
    "😕",
    "😟",
    "🙁",
    "☹️",
    "😮",
    "😯",
    "😲",
    "😳",
    "🥺",
    "😢",
    "😭",
    "😤",
    "😠",
    "😡",
    "🤬",
    "😇",
    "🤡",
    "👻",
    "💀",
    "☠️",
    "👽",
    "🤖",
    "💩",
    "😺",
    "😸",
    "😹",
    "😻",
    "😼",
    "😽",
    "🙀",
    "😿",
    "😾",
    "❤️",
    "🧡",
    "💛",
    "💚",
    "💙",
    "💜",
    "🖤",
    "🤍",
    "🤎",
    "💔",
    "❣️",
    "💕",
    "💞",
    "💓",
    "💗",
    "💖",
    "💘",
    "💝",
    "💟",
    "✨",
    "⚡",
    "🔥",
    "💥",
    "🌟",
    "🌈",
    "☀️",
    "🌤️",
    "⛅",
    "🌧️",
    "❄️",
    "☔",
    "💧",
    "🌊",
    "🍎",
    "🍇",
    "🍉",
    "🍌",
    "🍓",
    "🍒",
    "🍑",
    "🥭",
    "🍍",
    "🥝",
    "🥑",
    "🍆",
    "🥕",
    "🌶️",
    "🌽",
    "🥔",
    "🍟",
    "🍕",
    "🍔",
    "🌮",
    "🌯",
    "🥗",
    "🍱",
    "🍣",
    "🍤",
    "🍜",
    "🍝",
    "🍰",
    "🧁",
    "🍫",
    "🍿",
    "🍩",
    "🍪",
    "🥛",
    "🍼",
    "☕",
    "🍵",
    "🍺",
    "🍻",
    "🥂",
    "🍷",
    "🥃",
    "🍸",
    "🚀",
    "✈️",
    "🚗",
    "🚕",
    "🚙",
    "🚌",
    "🚎",
    "🏎️",
    "🚓",
    "🚑",
    "🚒",
    "🚐",
    "🚲",
    "🛴",
    "🏍️",
    "🛵",
    "⚽",
    "🏀",
    "🏈",
    "⚾",
    "🎾",
    "🏐",
    "🏉",
    "🎱",
    "🏓",
    "🏸",
    "🥊",
    "🥋",
    "🎯",
    "🎮",
    "🎲",
    "🎼",
    "🎹",
    "🥁",
  ];

  const insertEmoji = (e) => {
    setText((t) => t + e);
    showToast("Emoji added");
    setTimeout(() => chatRef.current?.scrollToBottom?.(), 30);
  };

  // NEW: presence ping for current user
  useEffect(() => {
    let t;
    const ping = async () => {
      try {
        await API.post("/presence/ping", {}, { headers: authHdr });
      } catch {}
    };
    ping();
    t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, [authHdr]);

  // Presence lookup with window_seconds guard
  useEffect(() => {
    let cancelled = false;
    const fetchPresence = async () => {
      try {
        const { data } = await API.get(
          `/presence/${encodeURIComponent(contact)}`,
          { headers: authHdr }
        );
        if (!cancelled) {
          const winMs = (data?.window_seconds ?? 60) * 1000;
          const seenMs = data?.last_seen
            ? new Date(data.last_seen).getTime()
            : 0;
          const withinWindow = seenMs ? Date.now() - seenMs <= winMs : true;
          const isOnline = !!data?.online && withinWindow;
          setContactOnline(isOnline);
          setContactLastSeen(data?.last_seen || null);
        }
      } catch {}
    };
    fetchPresence();
    const i = setInterval(fetchPresence, 20000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [contact, authHdr]);

  // Relative formatter
  const lastSeenText = (() => {
    if (!contactOnline) {
      if (!contactLastSeen) return "offline";
      const diff = Date.now() - new Date(contactLastSeen).getTime();
      const m = Math.floor(diff / 60000);
      const h = Math.floor(diff / 3600000);
      if (m < 1) return "last seen just now";
      if (m < 60) return `last seen ${m} min ago`;
      if (h < 24) return `last seen ${h} hr${h > 1 ? "s" : ""} ago`;
      return `last seen ${new Date(contactLastSeen).toLocaleString()}`;
    }
    return "online";
  })();

  const enhanceText = useCallback(async () => {
    const draft = text.trim();
    if (!draft || enhancing) return;
    setEnhancing(true);
    try {
      // Use the exact prompt pattern requested, appending the user's draft
      const payload = {
        text:
          "pls improve this sentence ok, just give the enhanced version without any words from you here is the text: " +
          draft,
      };
      const { data } = await API.post("/ai/enhance-chat", payload, {
        headers: authHdr,
      });
      const out = (data?.enhanced || "").toString().trim();
      if (out) {
        setText(out);
      } else {
        showToast("No enhancement returned", "error");
      }
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Enhance failed";
      showToast(msg, "error");
    } finally {
      setEnhancing(false);
    }
  }, [text, enhancing, authHdr, showToast]);

  return (
    <View style={styles.root}>
      {/* Outside overlay for dropdown */}
      {menuOpen && (
        <Pressable onPress={() => setMenuOpen(false)} style={styles.overlay}>
          <View />
        </Pressable>
      )}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
            />
          ) : (
            <Text style={styles.headerAvatarTxt}>
              {contact?.slice(0, 2)?.toUpperCase()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.contactName} numberOfLines={1}>
            {contact}
          </Text>
          <Text style={styles.contactSub} numberOfLines={1}>
            {lastSeenText}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Icon name="videocam" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}>
          <Icon name="call" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setMenuOpen((v) => !v)}
        >
          <Icon name="more-vert" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={styles.dropdown}>
          <TouchableOpacity
            style={styles.dropdownItemRow}
            onPress={() => {
              setMenuOpen(false);
              loadProfile();
            }}
          >
            <Icon
              name="person"
              size={16}
              color="#3a7afe"
              style={styles.ddIcon}
            />
            <Text style={styles.dropdownTxt}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dropdownItemRow}
            onPress={() => {
              setMenuOpen(false);
              deleteChat();
            }}
          >
            <Icon
              name="delete-forever"
              size={16}
              color="#ff6b6b"
              style={styles.ddIcon}
            />
            <Text style={[styles.dropdownTxt, { color: "#ff6b6b" }]}>
              Delete Chat
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ChatWindow
          ref={chatRef}
          activeContact={contact}
          messages={conversation}
          currentUserEmail={userEmail}
          onRefresh={loadMessages}
          onClear={() => {}}
          bottomInset={emojiVisible ? 320 : 70}
        />

        {/* Composer */}
        <View
          style={[
            styles.composerWrap,
            { marginBottom: Platform.OS === "android" ? keyboardOffset : 0 },
          ]}
        >
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={styles.iconSmall}
              onPress={() => setEmojiVisible(true)}
            >
              <Icon name="emoji-emotions" size={22} color="#8696a0" />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={COLORS.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
              selectionColor="#3a7afe"
            />

            {/* NEW: Enhance (sparkles) button just left of the attachment icon */}
            <TouchableOpacity
              style={styles.iconSmall}
              onPress={enhanceText}
              disabled={!text.trim() || enhancing}
            >
              {enhancing ? (
                <ActivityIndicator size="small" color="#8696a0" />
              ) : (
                <Icon name="auto-awesome" size={22} color="#8696a0" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconSmall}
              onPress={() => setShareVisible(true)}
            >
              <Icon name="attach-file" size={22} color="#8696a0" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.sendBtn}
            disabled={!text.trim() || loadingSend}
            onPress={sendMessage}
          >
            {loadingSend ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {toast && (
          <View
            style={[
              styles.toastWrap,
              toast.type === "error" ? styles.toastErr : styles.toastOk,
            ]}
          >
            <Icon
              name={toast.type === "error" ? "error-outline" : "check-circle"}
              size={16}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.toastTxt}>{toast.msg}</Text>
          </View>
        )}

        <Modal
          transparent
          visible={emojiVisible}
          animationType="fade"
          onRequestClose={() => setEmojiVisible(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setEmojiVisible(false)}
          >
            <View />
          </Pressable>
          <View style={styles.emojiSheet}>
            <View style={styles.emojiSheetHeader}>
              <Text style={styles.emojiSheetTitle}>Emojis</Text>
              <TouchableOpacity onPress={() => setEmojiVisible(false)}>
                <Icon name="close" size={20} color="#9ab1c1" />
              </TouchableOpacity>
            </View>
            <View style={styles.emojiGrid}>
              {largeEmojis.map((em, i) => (
                <TouchableOpacity
                  key={`${em}_${i}`} // unique key (emoji may repeat)
                  style={styles.emojiCell}
                  onPress={() => insertEmoji(em)}
                >
                  <Text style={styles.emojiCellTxt}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>

      {/* Profile Modal */}
      <Modal
        transparent
        visible={profileVisible}
        animationType="fade"
        onRequestClose={() => setProfileVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setProfileVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.profileCard}>
          {profileLoading ? (
            <ActivityIndicator color="#3a7afe" />
          ) : profileError ? (
            <Text style={{ color: "#f55" }}>{profileError}</Text>
          ) : profileData ? (
            <>
              <Text style={styles.heading}>Name</Text>
              <Text style={styles.profileNameValue}>
                {profileData.name || "—"}
              </Text>
              <Text style={styles.heading}>About</Text>
              <Text style={styles.profileAbout}>
                {profileData.about || "—"}
              </Text>
              <Text style={styles.heading}>Email</Text>
              <Text style={styles.profileMetaLine}>{contact}</Text>
              <Text style={styles.heading}>Username</Text>
              <Text style={styles.profileMetaLine}>
                {profileData.userid || "—"}
              </Text>
              <Text style={styles.heading}>Avatar URL</Text>
              <Text style={styles.profileMetaLine}>
                {profileData.avatar_url || "—"}
              </Text>
            </>
          ) : (
            <Text style={{ color: "#ccc" }}>No profile data.</Text>
          )}
          <TouchableOpacity
            onPress={() => setProfileVisible(false)}
            style={{ alignSelf: "flex-end", marginTop: 16 }}
          >
            <Text style={{ color: "#3a7afe", fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Share Sheet */}
      <Modal
        transparent
        visible={shareVisible}
        animationType="fade"
        onRequestClose={() => setShareVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShareVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.shareSheet}>
          <Text style={styles.shareTitle}>Share</Text>
          <View style={styles.shareGrid}>
            <ShareItem
              label="Media"
              color="#5c6ef8"
              icon="image"
              onPress={() => showToast("Media picker not implemented", "error")}
            />
            <ShareItem
              label="Documents"
              color="#8e61d6"
              icon="description"
              onPress={() =>
                showToast("Documents picker not implemented", "error")
              }
            />
            <ShareItem
              label="Location"
              color="#17a884"
              icon="place"
              onPress={() =>
                showToast("Location sharing not implemented", "error")
              }
            />
            <ShareItem
              label="Contact"
              color="#e08922"
              icon="person"
              onPress={() =>
                showToast("Contact sharing not implemented", "error")
              }
            />
            <ShareItem
              label="Close"
              color="#444f5d"
              icon="close"
              onPress={() => setShareVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ShareItem({ label, color, icon, onPress }) {
  return (
    <TouchableOpacity style={styles.shareItem} onPress={onPress}>
      <View style={[styles.shareIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={22} color="#fff" />
      </View>
      <Text style={styles.shareLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 5 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: (StatusBar.currentHeight || 0) + 4,
    paddingBottom: 8,
    paddingHorizontal: 4,
    backgroundColor: COLORS.bar,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1f2c34",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    overflow: "hidden",
  },
  headerAvatarTxt: { color: COLORS.textPrimary, fontWeight: "600" },
  contactName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  contactSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  composerWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: COLORS.bg,
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.bgInput,
    borderRadius: 26,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  iconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 6,
    maxHeight: 120,
  },
  sendBtn: {
    height: 48,
    minWidth: 54,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: COLORS.send,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  dropdown: {
    position: "absolute",
    top: (StatusBar.currentHeight || 0) + 54,
    right: 4,
    backgroundColor: "#142432",
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#1e3547",
    zIndex: 10,
  },
  dropdownItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ddIcon: { marginRight: 8 },
  dropdownTxt: { color: "#fff", fontSize: 13 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  profileCard: {
    position: "absolute",
    left: 30,
    right: 30,
    top: "28%",
    backgroundColor: "#182636",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#28435b",
  },
  heading: {
    marginTop: 10,
    color: "#6f8294",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  profileNameValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  profileAbout: {
    color: "#c8d3dc",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  profileMetaLine: {
    color: "#b9c5d1",
    fontSize: 12,
    marginTop: 2,
  },
  toastWrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 90,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    elevation: 5,
  },
  toastOk: {
    backgroundColor: "#1d3d55",
    borderWidth: 1,
    borderColor: "#2d5773",
  },
  toastErr: {
    backgroundColor: "#552326",
    borderWidth: 1,
    borderColor: "#7d3a3f",
  },
  toastTxt: { color: "#fff", fontSize: 13, flexShrink: 1 },
  emojiSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#142332",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: "#203b52",
    maxHeight: 360,
  },
  emojiSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    marginBottom: 6,
  },
  emojiSheetTitle: {
    flex: 1,
    color: "#e9edef",
    fontWeight: "600",
    fontSize: 14,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 6,
  },
  emojiCell: {
    width: "11.11%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  emojiCellTxt: {
    fontSize: 24,
  },
  shareSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#142332",
    paddingTop: 18,
    paddingBottom: 28,
    paddingHorizontal: 18,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "#21384c",
  },
  shareTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  shareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  shareItem: {
    width: "25%",
    alignItems: "center",
    marginBottom: 18,
  },
  shareIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  shareLabel: { color: "#e9edef", fontSize: 11, textAlign: "center" },
});
