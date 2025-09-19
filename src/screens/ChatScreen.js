import React, { useEffect, useState, useCallback, useContext } from "react";
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  TouchableOpacity,
  Text,
} from "react-native";
import { TextInput, Button } from "react-native-paper";
import API from "../api";
import ContactList from "../components/ContactList";
import ChatWindow from "../components/ChatWindow";
import { AuthContext } from "../AuthContext";

export default function ChatScreen() {
  const { userEmail } = useContext(AuthContext);
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
    <View style={styles.root}>
      {/* Contacts Panel */}
      {(isWide || showContacts) && (
        <View style={[styles.contactsPane, !isWide && styles.overlay]}>
          {!isWide && activeContact && (
            <TouchableOpacity
              style={styles.closeOverlay}
              onPress={() => setShowContacts(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Close</Text>
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
        {!isWide && !showContacts && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setShowContacts(true)}
          >
            <Text style={styles.backTxt}>Contacts</Text>
          </TouchableOpacity>
        )}
        <ChatWindow
          activeContact={activeContact}
          messages={filtered}
          currentUserEmail={userEmail}
          onRefresh={loadMessages}
          onClear={clearChat}
        />
        {!!error && (
          <Text
            style={{ color: "#f55", paddingHorizontal: 12, paddingBottom: 4 }}
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
              placeholder="Type a message"
              style={styles.input}
              underlineColor="transparent"
              placeholderTextColor="#777"
            />
            <Button
              mode="contained"
              onPress={sendMessage}
              disabled={!text.trim() || loading}
              style={styles.send}
            >
              {loading ? <ActivityIndicator color="#fff" /> : "Send"}
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  chatPane: { flex: 1 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#222",
    backgroundColor: "#161616",
  },
  input: { flex: 1, backgroundColor: "#222", color: "#fff", marginRight: 8 },
  send: { borderRadius: 8 },
  backBtn: {
    padding: 10,
    backgroundColor: "#161616",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  backTxt: { color: "#3a7afe", fontWeight: "600" },
});
