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
  const { userEmail } = useContext(AuthContext);
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
  const [showEmoji, setShowEmoji] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  const chatRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await API.get("/messages");
      setAllMessages(res.data || []);
    } catch {
      /* silent */
    }
  }, []);

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
          await API.post("/messages/read", { message_id: m.id });
        } catch {}
      }
      setAllMessages((prev) =>
        prev.map((p) =>
          unread.find((u) => u.id === p.id) ? { ...p, read: true } : p
        )
      );
    })();
  }, [conversation, userEmail]);

  const sendMessage = useCallback(async () => {
    if (!text.trim() || !contact) return;
    setLoadingSend(true);
    try {
      await API.post("/messages", {
        receiver_email: contact,
        content: text.trim(),
      });
      setText("");
      await loadMessages();
      setTimeout(() => chatRef.current?.scrollToBottom?.(), 60);
    } finally {
      setLoadingSend(false);
    }
  }, [text, contact, loadMessages]);

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
        `/users/search?email=${encodeURIComponent(contact)}`
      );
      setProfileData(data);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }, [contact]);

  const deleteChat = useCallback(() => {
    Alert.alert("Delete Chat", `Delete chat with ${contact}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete(`/messages/${encodeURIComponent(contact)}`);
          } catch {}
          navigation.goBack();
        },
      },
    ]);
  }, [contact, navigation]);

  // Fetch avatar
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await API.get(
          `/users/search?email=${encodeURIComponent(contact)}`
        );
        if (mounted && data?.avatar_url) setAvatarUrl(data.avatar_url);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [contact]);

  const quickEmojis = ["😀", "😉", "🔥", "👍", "❤️", "😂", "🚀", "🙏"];
  const insertEmoji = (e) => {
    setText((t) => t + e);
    setTimeout(() => chatRef.current?.scrollToBottom?.(), 40);
  };

  return (
    <View style={styles.root}>
      {/* Outside overlay for dropdown */}
      {menuOpen && (
        <Pressable
          onPress={() => setMenuOpen(false)}
          style={styles.overlay}
        >
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
            online
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
          bottomInset={showEmoji ? 170 : 70}
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
              onPress={() => setShowEmoji((v) => !v)}
            >
              <Text style={{ fontSize: 20 }}>😊</Text>
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

        {showEmoji && (
          <View style={styles.emojiBar}>
            {quickEmojis.map((em) => (
              <TouchableOpacity
                key={em}
                onPress={() => insertEmoji(em)}
                style={styles.emojiBtn}
              >
                <Text style={styles.emojiTxt}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
              onPress={() => Alert.alert("Media", "Not implemented")}
            />
            <ShareItem
              label="Documents"
              color="#8e61d6"
              icon="description"
              onPress={() => Alert.alert("Documents", "Not implemented")}
            />
            <ShareItem
              label="Location"
              color="#17a884"
              icon="place"
              onPress={() => Alert.alert("Location", "Not implemented")}
            />
            <ShareItem
              label="Contact"
              color="#e08922"
              icon="person"
              onPress={() => Alert.alert("Contact", "Not implemented")}
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
  emojiBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#192530",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderColor: "#223241",
  },
  emojiBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    margin: 2,
  },
  emojiTxt: { fontSize: 22 },
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
