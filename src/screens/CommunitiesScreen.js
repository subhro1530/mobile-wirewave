import React, {
  useEffect,
  useState,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import API from "../api";
import { AuthContext } from "../AuthContext";

const C = {
  bg: "#0b141a",
  bar: "#14233a",
  pill: "#1b2b3d",
  border: "#24425f",
  accent: "#3a7afe",
  text: "#e9edef",
  sub: "#8696a0",
  card: "#132536",
};

export default function CommunitiesScreen() {
  const { userEmail, userToken } = useContext(AuthContext); // include token
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [content, setContent] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [broadcastVisible, setBroadcastVisible] = useState(false); // NEW (replaces always-on UI)
  const [lastBroadcastInfo, setLastBroadcastInfo] = useState(null); // { at: Date, count: number }

  const authHdr = userToken
    ? { Authorization: `Bearer ${userToken}` }
    : undefined;

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await API.get("/messages", { headers: authHdr });
      setMessages(data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [authHdr]);

  useEffect(() => {
    loadMessages();
    const i = setInterval(loadMessages, 6000);
    return () => clearInterval(i);
  }, [loadMessages]);

  const contacts = useMemo(() => {
    const map = new Map();
    messages.forEach((m) => {
      const peer =
        m.sender_email === userEmail ? m.receiver_email : m.sender_email;
      if (!peer || peer === userEmail) return;
      const existing = map.get(peer);
      if (
        !existing ||
        new Date(m.sent_at) > new Date(existing.lastMessageTime || 0)
      ) {
        map.set(peer, {
          email: peer,
          lastMessage: m.content,
          lastMessageTime: m.sent_at,
        });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );
  }, [messages, userEmail]);

  const filtered = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  };

  const sendBroadcast = async () => {
    const emails = Array.from(selected);
    if (!emails.length) {
      Alert.alert("Missing", "Select at least one recipient.");
      return;
    }
    const userTyped = content.trim();
    const finalContent = `📢 ${userTyped || "Broadcast message sent"}`;
    setSending(true);
    try {
      await API.post(
        "/messages/multi",
        { receiver_emails: emails, content: finalContent },
        { headers: authHdr }
      );
      setLastBroadcastInfo({ at: Date.now(), count: emails.length });
      setContent("");
      setSelected(new Set());
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Failed to send"
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <View style={styles.topBar}>
        <Text style={styles.title}>Communities</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setBroadcastVisible(true)}
        >
          <Icon name="campaign" size={20} color="#fff" /> {/* was mic */}
        </TouchableOpacity>
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>No communities yet</Text>
        <Text style={styles.placeholderSub}>
          Tap the mic icon to send a broadcast
        </Text>
      </View>

      {/* Broadcast Modal */}
      <Modal
        transparent
        visible={broadcastVisible}
        animationType="fade"
        onRequestClose={() => !sending && setBroadcastVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => !sending && setBroadcastVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.broadcastCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.infoTitle}>Broadcast</Text>
            <TouchableOpacity
              onPress={() => setBroadcastVisible(false)}
              style={{ padding: 4 }}
            >
              <Icon name="close" size={20} color="#e9edef" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchBar}>
            <Icon
              name="search"
              size={18}
              color="#6d7d92"
              style={{ marginHorizontal: 10 }}
            />
            <TextInput
              style={[styles.searchInput, { color: C.text }]} // ensure white
              placeholder="Search people"
              placeholderTextColor="#6d7d92"
              value={search}
              onChangeText={setSearch}
              selectionColor="#3a7afe" // added
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                style={{ paddingHorizontal: 8 }}
              >
                <Icon name="close" size={18} color="#6d7d92" />
              </TouchableOpacity>
            )}
          </View>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={C.accent} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.email}
              contentContainerStyle={{ paddingBottom: 120 }}
              style={{ maxHeight: 260, marginTop: 4 }}
              renderItem={({ item }) => {
                const active = selected.has(item.email);
                return (
                  <TouchableOpacity
                    style={[styles.contactRow, active && styles.rowActive]}
                    onPress={() => toggle(item.email)}
                  >
                    <View
                      style={[styles.avatar, active && styles.avatarActive]}
                    >
                      {active ? (
                        <Icon name="check" size={18} color="#fff" />
                      ) : (
                        <Text style={styles.avatarTxt}>
                          {item.email.slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.email} numberOfLines={1}>
                        {item.email}
                      </Text>
                      <Text style={styles.preview} numberOfLines={1}>
                        {item.lastMessage || "No messages yet"}
                      </Text>
                    </View>
                    {active && (
                      <Icon
                        name="campaign"
                        size={18}
                        color={C.accent}
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 24, alignItems: "center" }}>
                  <Text style={{ color: C.sub, fontSize: 12 }}>
                    No contacts yet
                  </Text>
                </View>
              }
            />
          )}
          {/* Inline success feedback */}
          {lastBroadcastInfo && (
            <Text style={styles.successNote}>
              Sent to {lastBroadcastInfo.count} contact
              {lastBroadcastInfo.count === 1 ? "" : "s"} just now
            </Text>
          )}
          <Text style={styles.countTxt}>{selected.size} selected</Text>
          <View style={styles.messageBox}>
            <TextInput
              style={styles.messageInput}
              multiline
              placeholder="Broadcast message (leave empty for default)"
              placeholderTextColor="#5f6d7c"
              value={content}
              onChangeText={setContent}
              selectionColor="#3a7afe"
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!selected.size || sending) && { opacity: 0.45 },
              ]}
              disabled={!selected.size || sending}
              onPress={sendBroadcast}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Icon name="campaign" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: (StatusBar.currentHeight || 0) + 2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.bar,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  placeholderTitle: { color: C.text, fontSize: 16, fontWeight: "600" },
  placeholderSub: { color: C.sub, fontSize: 12, marginTop: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: C.pill,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  contactRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2c34",
    backgroundColor: "#111b21",
  },
  rowActive: {
    backgroundColor: "#17283a",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#23344a",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarActive: {
    backgroundColor: C.accent,
  },
  avatarTxt: { color: "#fff", fontWeight: "600" },
  email: { color: C.text, fontWeight: "600", fontSize: 14 },
  preview: { color: C.sub, fontSize: 11, marginTop: 2 },
  broadcastCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: "10%",
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  countTxt: { color: C.sub, fontSize: 11, marginBottom: 6, paddingLeft: 4 },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#182a3b",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#223b53",
  },
  messageInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    maxHeight: 110,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  infoCard: {
    position: "absolute",
    left: 26,
    right: 26,
    top: "28%",
    backgroundColor: C.card,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#24425f",
  },
  infoTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  infoBody: { color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 8 },
  successNote: {
    color: "#4cc790",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 6,
    marginBottom: 2,
  },
});
