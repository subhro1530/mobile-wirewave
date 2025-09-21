// components/ContactList.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

export default function ContactList({
  messages = [],
  currentUserEmail,
  onSelect,
  onClose,
  logout, // added
  notificationsEnabled, // added
  onToggleNotifications, // added
}) {
  const [query, setQuery] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showMenu, setShowMenu] = useState(false); // added
  const [showNewInputs, setShowNewInputs] = useState(false); // added

  const contacts = useMemo(() => {
    const map = new Map();
    messages.forEach((m) => {
      const peer =
        m.sender_email === currentUserEmail ? m.receiver_email : m.sender_email;
      if (!peer || peer === currentUserEmail) return;
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
  }, [messages, currentUserEmail]);

  const filtered = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(query.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(query.toLowerCase())
  );

  const handleAdd = () => {
    const e = newEmail.trim();
    if (!e || !e.includes("@")) return;
    onSelect?.(e);
    setNewEmail("");
    setShowNewInputs(false);
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => setShowMenu((v) => !v)}
        >
          <Icon name="more-vert" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Chats
        </Text>
        {onClose ? (
          <TouchableOpacity style={styles.topBtn} onPress={onClose}>
            <Icon name="close" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {showMenu && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowNewInputs((s) => !s);
              setShowMenu(false);
              setQuery("");
            }}
          >
            <Text style={styles.menuItemTxt}>
              {showNewInputs ? "Hide New Chat" : "Start New Chat"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              onToggleNotifications?.();
              setShowMenu(false);
            }}
          >
            <Text style={styles.menuItemTxt}>
              {notificationsEnabled
                ? "Disable Notifications"
                : "Enable Notifications"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              logout?.();
            }}
          >
            <Text style={[styles.menuItemTxt, { color: "#ff6666" }]}>
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showNewInputs && (
        <>
          <View style={styles.section}>
            <TextInput
              style={styles.search}
              placeholder="Search..."
              placeholderTextColor="#666"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <View style={styles.sectionRow}>
            <TextInput
              style={[styles.search, { flex: 1 }]}
              placeholder="Start new chat (email)"
              placeholderTextColor="#666"
              value={newEmail}
              onChangeText={setNewEmail}
              onSubmitEditing={handleAdd}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
              <Text style={styles.addTxt}>+</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <FlatList
        data={showNewInputs ? filtered : contacts}
        keyExtractor={(item) => item.email}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => onSelect?.(item.email)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>
                {item.email.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.email}</Text>
              <Text
                style={styles.preview}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.lastMessage || "No messages yet"}
              </Text>
            </View>
            <Text style={styles.time}>
              {item.lastMessageTime &&
                new Date(item.lastMessageTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: "#555" }}>
              {showNewInputs ? "No matches" : "No conversations"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "#181818",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  topBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { flex: 1, textAlign: "center", color: "#fff", fontWeight: "600" },
  menu: {
    position: "absolute",
    top: 48,
    left: 8,
    right: 8,
    backgroundColor: "#222",
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 40,
    elevation: 8,
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  menuItemTxt: { color: "#eee", fontSize: 13 },
  section: { paddingHorizontal: 12, marginTop: 6, marginBottom: 4 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  search: {
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  addBtn: {
    width: 44,
    height: 44,
    marginLeft: 8,
    backgroundColor: "#3a7afe",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  addTxt: { color: "#fff", fontSize: 22, fontWeight: "600" },
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3a7afe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarTxt: { color: "#fff", fontWeight: "600" },
  name: { color: "#fff", fontSize: 14, marginBottom: 2 },
  preview: { color: "#888", fontSize: 12, maxWidth: 160 },
  time: { color: "#666", fontSize: 10, marginLeft: 6 },
  empty: { padding: 32, alignItems: "center" },
});
