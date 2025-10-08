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
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../AuthContext";
import API from "../api";
import Icon from "react-native-vector-icons/MaterialIcons";
import ChatWindow from "../components/ChatWindow";

const COLORS = {
  bar: "#14233a", // changed from green
  bg: "#0b141a",
  bgInput: "#1f2c34",
  accent: "#25D366",
  textPrimary: "#e9edef",
  textSecondary: "#8696a0",
  bubbleMine: "#005c4b",
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

  return (
    <View style={styles.root}>
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
          <TouchableOpacity
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            onPress={() => {
              // open profile from here by simple alert style fallback
              Alert.alert("Contact", contact);
            }}
          >
            <Text style={styles.headerAvatarTxt}>
              {contact?.slice(0, 2)?.toUpperCase()}
            </Text>
          </TouchableOpacity>
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
            style={styles.dropdownItem}
            onPress={() => {
              setMenuOpen(false);
              loadProfile();
            }}
          >
            <Text style={styles.dropdownTxt}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dropdownItem}
            onPress={() => {
              setMenuOpen(false);
              deleteChat();
            }}
          >
            <Text style={[styles.dropdownTxt, { color: "#ff6b6b" }]}>
              Delete Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dropdownItem}
            onPress={() => setMenuOpen(false)}
          >
            <Text style={[styles.dropdownTxt, { color: "#8696a0" }]}>
              Close
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
          bottomInset={70}
        />

        {/* Composer */}
        <View
          style={[
            styles.composerWrap,
            { marginBottom: Platform.OS === "android" ? keyboardOffset : 0 },
          ]}
        >
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.plusBtn}>
              <Icon name="emoji-emotions" size={22} color="#8696a0" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={COLORS.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity style={styles.attachBtn}>
              <Icon name="attach-file" size={22} color="#8696a0" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn}>
              <Icon name="camera-alt" size={22} color="#8696a0" />
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
              <Icon name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
              <Text style={styles.profileTitle}>{contact}</Text>
              {profileData.name && (
                <Text style={styles.profileName}>{profileData.name}</Text>
              )}
              {profileData.about && (
                <Text style={styles.profileAbout}>{profileData.about}</Text>
              )}
              {profileData.avatar_url && (
                <Text style={styles.profileMeta}>
                  Avatar: {profileData.avatar_url}
                </Text>
              )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: (StatusBar.currentHeight || 0) + 4,
    paddingBottom: 8,
    paddingHorizontal: 4,
    backgroundColor: COLORS.bar, // updated
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
    backgroundColor: "#0b141a",
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.bgInput,
    borderRadius: 26,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: "flex-end",
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
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
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
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
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
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
  profileTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  profileName: {
    color: "#3a7afe",
    marginTop: 6,
    fontSize: 15,
    fontWeight: "600",
  },
  profileAbout: {
    color: "#9db2c9",
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
  },
  profileMeta: { color: "#657b92", marginTop: 8, fontSize: 11 },
});
