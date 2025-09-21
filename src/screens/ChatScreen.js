import React, { useEffect, useState, useCallback, useContext } from "react";
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
  Image, // added
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "padding"} // changed: use padding on Android too
        keyboardVerticalOffset={
          Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0
        }
      >
        <View style={styles.root}>
          {/* Contacts Panel */}
          {(isWide || showContacts) && (
            <View style={[styles.contactsPane, !isWide && styles.overlay]}>
              {!isWide && activeContact && (
                <TouchableOpacity
                  style={styles.closeOverlay}
                  onPress={() => setShowContacts(false)}
                  accessibilityLabel="Close contacts panel"
                >
                  <Icon name="close" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <ContactList
                messages={messages}
                currentUserEmail={userEmail}
                onSelect={(email) => {
                  setActiveContact(email);
                  if (!isWide) setShowContacts(false);
                }}
                onClose={() => setShowContacts(false)}
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
              <TouchableOpacity style={styles.iconBtn} onPress={logout}>
                <Icon name="logout" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Chat window */}
            <ChatWindow
              activeContact={activeContact}
              messages={filtered}
              currentUserEmail={userEmail}
              onRefresh={loadMessages}
              onClear={clearChat}
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
              <View style={styles.composer}>
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
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0,
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
    paddingVertical: 8,
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
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4, // slightly reduced
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
    backgroundColor: "#161616",
  },
  input: {
    flex: 1,
    backgroundColor: "#222",
    color: "#fff",
    paddingHorizontal: 10,
    height: 40, // tighter field
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3a7afe",
    alignItems: "center",
    justifyContent: "center",
  },
});
