import React, {
  useEffect,
  useState,
  useCallback,
  useContext,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { TextInput } from "react-native-paper";
import API from "../api";
import ContactList from "../components/ContactList";
import ChatWindow from "../components/ChatWindow";
import { AuthContext } from "../AuthContext";
import Icon from "react-native-vector-icons/MaterialIcons";

export default function ChatScreen() {
  const { userEmail, logout } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const [showContacts, setShowContacts] = useState(true); // auto true on narrow until contact chosen
  const [keyboardVisible, setKeyboardVisible] = useState(false); // added
  const [notificationsEnabled, setNotificationsEnabled] = useState(true); // added
  const knownContactsRef = useRef(new Set()); // stable ref
  const [newContactNotice, setNewContactNotice] = useState(null); // added
  const [keyboardHeight, setKeyboardHeight] = useState(0); // added
  const [composerHeight, setComposerHeight] = useState(52); // added default
  const chatListRef = useRef(null); // optional future use
  const chatWindowRef = useRef(null); // added

  const loadMessages = useCallback(async () => {
    if (!userEmail) return;
    try {
      setError(null);
      const res = await API.get("/messages");
      setMessages(res.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load");
      console.warn("Load messages failed:", e);
    }
  }, [userEmail]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const filtered = activeContact
    ? messages.filter(
        (m) =>
          (m.sender_email === userEmail &&
            m.receiver_email === activeContact) ||
          (m.receiver_email === userEmail && m.sender_email === activeContact)
      )
    : [];

  const sendMessage = async () => {
    if (!text.trim() || !activeContact) return;
    setLoading(true);
    try {
      await API.post("/messages", {
        receiver_email: activeContact,
        content: text.trim(),
      });
      setText("");
      await loadMessages();
      chatWindowRef.current?.scrollToBottom?.(); // ensure bottom after send
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    if (!activeContact) return;
    // If API has a clear endpoint you can call it; for now just local filter
    setMessages((prev) =>
      prev.filter(
        (m) =>
          !(
            m.sender_email === activeContact ||
            m.receiver_email === activeContact
          )
      )
    );
  };

  // Auto hide contacts on narrow screens after selecting one
  useEffect(() => {
    if (!isWide && activeContact) setShowContacts(false);
  }, [activeContact, isWide]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(
        Platform.OS === "android" ? e.endCoordinates.height : 0
      );
      chatWindowRef.current?.scrollToBottom?.(); // scroll when keyboard appears
      // slight delay then force scroll (if ChatWindow already auto scrolls it is harmless)
      setTimeout(() => {
        // ChatWindow internally auto-scrolls; extra safeguard
      }, 60);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Track new contacts for notification
  useEffect(() => {
    const current = new Set();
    messages.forEach((m) => {
      const peer =
        m.sender_email === userEmail ? m.receiver_email : m.sender_email;
      if (peer && peer !== userEmail) current.add(peer);
    });

    const prev = knownContactsRef.current;

    if (notificationsEnabled && prev.size) {
      current.forEach((c) => {
        if (!prev.has(c)) {
          setNewContactNotice(c);
          setTimeout(() => setNewContactNotice(null), 4000);
        }
      });
    }

    // Update ref only if changed (avoid unnecessary renders)
    if (prev.size !== current.size || [...prev].some((p) => !current.has(p))) {
      knownContactsRef.current = current;
    }
  }, [messages, userEmail, notificationsEnabled]); // removed knownContacts from deps

  const bottomInset = composerHeight + 8; // space for last bubble

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.root}>
          {/* Contacts Panel */}
          {(isWide || showContacts) && (
            <View style={[styles.contactsPane, !isWide && styles.overlay]}>
              {/* top bar & menu handled inside ContactList now */}
              <ContactList
                messages={messages}
                currentUserEmail={userEmail}
                onSelect={(email) => {
                  setActiveContact(email);
                  if (!isWide) setShowContacts(false);
                }}
                onClose={() => setShowContacts(false)}
                logout={logout}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={() => setNotificationsEnabled((v) => !v)}
              />
            </View>
          )}

          {/* Chat Pane */}
          <View style={styles.chatPane}>
            {/* Header bar with toggle + logout */}
            <View style={styles.headerBar}>
              {!isWide && !showContacts && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => setShowContacts(true)}
                >
                  <Icon name="menu" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              <View style={styles.headerCenter}>
                {activeContact && (
                  <View style={styles.chatInfo}>
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarSmallTxt}>
                        {activeContact.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.chatEmail} numberOfLines={1}>
                      {activeContact}
                    </Text>
                  </View>
                )}
              </View>
              {/* removed logout icon (in sidebar menu) */}
              <View style={{ width: 38 }} />
            </View>
            {newContactNotice && (
              <View style={styles.noticeBanner}>
                <Text style={styles.noticeText}>
                  New conversation: {newContactNotice}
                </Text>
              </View>
            )}
            {/* Chat window */}
            <ChatWindow
              ref={chatWindowRef} // added
              activeContact={activeContact}
              messages={filtered}
              currentUserEmail={userEmail}
              onRefresh={loadMessages}
              onClear={clearChat}
              bottomInset={bottomInset} // added
            />
            {!!error && (
              <Text
                style={{
                  color: "#f55",
                  paddingHorizontal: 12,
                  paddingBottom: 4,
                }}
              >
                {error}
              </Text>
            )}
            {activeContact && (
              <View
                onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
                style={[
                  styles.composerFixed,
                  {
                    bottom: Platform.OS === "android" ? keyboardHeight : 0,
                  },
                ]}
              >
                <TextInput
                  value={text}
                  mode="flat"
                  onChangeText={setText}
                  placeholder="Type a message here..."
                  placeholderTextColor="#777"
                  textColor="#fff"
                  theme={{
                    colors: {
                      primary: "#3a7afe",
                      background: "#222",
                      surface: "#222",
                      onSurface: "#fff",
                      text: "#fff",
                    },
                  }}
                  style={styles.input}
                  underlineColor="transparent"
                />
                <TouchableOpacity
                  style={styles.sendBtn}
                  disabled={!text.trim() || loading}
                  onPress={sendMessage}
                  accessibilityLabel="Send message"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Icon name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#101010",
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 4 : 4,
    paddingBottom: 0,
  },
  root: { flex: 1, flexDirection: "row", backgroundColor: "#101010" },
  contactsPane: {
    width: 300,
    backgroundColor: "#161616",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#262626",
  },
  overlay: {
    position: "absolute",
    zIndex: 20,
    left: 0,
    top: 0,
    bottom: 0,
    width: "75%",
    maxWidth: 340,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  closeOverlay: {
    padding: 12,
    borderBottomColor: "#222",
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#1d1d1d",
    alignItems: "flex-end",
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6, // reduced
    backgroundColor: "#161616",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  chatInfo: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "90%",
  },
  avatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#3a7afe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarSmallTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  chatEmail: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    maxWidth: 180,
  },
  chatPane: { flex: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  composerFixed: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#161616",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
  },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    paddingHorizontal: 10,
    height: 40,
    marginRight: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3a7afe",
    alignItems: "center",
    justifyContent: "center",
  },
  noticeBanner: {
    backgroundColor: "#233b70",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2b4d92",
  },
  noticeText: { color: "#fff", fontSize: 12 },
});
