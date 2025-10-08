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
  ActivityIndicator,
  TouchableOpacity,
  Text,
  SafeAreaView,
  StatusBar,
  FlatList,
  Image,
  Modal,
  Pressable,
} from "react-native";
import API from "../api";
import { AuthContext } from "../AuthContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import { TextInput } from "react-native-paper";

export default function ChatScreen() {
  const { userEmail, logout } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const navigation = useNavigation();

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!userEmail) return;
    try {
      setError(null);
      const res = await API.get("/messages");
      setMessages(res.data || []);
    } catch (e) {
      setError(e?.message || "Failed to load");
    }
  }, [userEmail]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Derive contacts from messages
  const contacts = React.useMemo(() => {
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

  // Filter contacts by search
  const filtered = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Profile modal logic
  const openProfileModal = useCallback(async () => {
    setProfileModalVisible(true);
    setProfileLoading(true);
    setProfileError(null);
    setProfileData(null);
    try {
      const { data } = await API.get("/profile");
      setProfileData(data);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Top bar */}
      <View style={styles.topBar}>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            /* implement search UI if needed */
          }}
        >
          <Icon name="search" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => setShowMenu((v) => !v)}
        >
          <Icon name="more-vert" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      {/* Menu */}
      {showMenu && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              openProfileModal();
            }}
          >
            <Text style={styles.menuItemTxt}>My Profile</Text>
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
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      {/* Chat list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.email}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => {
          const unreadCount = messages.filter(
            (m) =>
              m.sender_email === item.email &&
              m.receiver_email === userEmail &&
              !m.read
          ).length;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                navigation.navigate("ChatWindow", { contact: item.email })
              }
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
              <View style={{ alignItems: "flex-end", minWidth: 34 }}>
                <Text style={styles.time}>
                  {item.lastMessageTime &&
                    new Date(item.lastMessageTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </Text>
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeTxt}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: "#555" }}>No conversations</Text>
          </View>
        }
      />
      {/* Floating new chat button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          /* implement new chat UI if needed */
        }}
      >
        <Icon name="chat" size={28} color="#fff" />
      </TouchableOpacity>
      {/* Profile Modal */}
      <Modal
        transparent
        visible={profileModalVisible}
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setProfileModalVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.modalCard}>
          {profileLoading ? (
            <ActivityIndicator color="#3a7afe" />
          ) : profileError ? (
            <Text style={{ color: "#f55" }}>{profileError}</Text>
          ) : profileData ? (
            <>
              {profileData.avatar_url ? (
                <Image
                  source={{ uri: profileData.avatar_url }}
                  style={styles.profileAvatar}
                />
              ) : null}
              <Text style={styles.profileEmail}>{userEmail}</Text>
              {profileData.name ? (
                <Text style={styles.profileName}>{profileData.name}</Text>
              ) : null}
              {profileData.about ? (
                <Text style={styles.profileAbout}>{profileData.about}</Text>
              ) : null}
              {profileData.avatar_url ? (
                <Text style={styles.profileMeta}>
                  Avatar URL: {profileData.avatar_url}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: "#ccc" }}>No profile data.</Text>
          )}
          <TouchableOpacity
            onPress={() => setProfileModalVisible(false)}
            style={styles.closeModalBtn}
          >
            <Text style={{ color: "#3a7afe", fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
      {!!error && (
        <Text
          style={{ color: "#f55", paddingHorizontal: 12, paddingBottom: 4 }}
        >
          {error}
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#101010",
    paddingTop: StatusBar.currentHeight || 0,
    paddingBottom: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#181818",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  logo: { width: 38, height: 38, marginRight: 10 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  menu: {
    position: "absolute",
    top: 58,
    right: 10,
    backgroundColor: "#222",
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 140,
    zIndex: 40,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
  },
  menuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  menuItemTxt: { color: "#eee", fontSize: 13 },
  searchWrap: { paddingHorizontal: 12, marginTop: 8, marginBottom: 4 },
  searchInput: {
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
    backgroundColor: "#181818",
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
  unreadBadge: {
    marginTop: 4,
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#3a7afe",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeTxt: { color: "#fff", fontSize: 11, fontWeight: "600" },
  empty: { padding: 32, alignItems: "center" },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 32,
    backgroundColor: "#3a7afe",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    zIndex: 100,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalCard: {
    position: "absolute",
    left: 24,
    right: 24,
    top: "25%",
    backgroundColor: "#181818",
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
  },
  profileEmail: { color: "#fff", fontSize: 16, fontWeight: "600" },
  profileName: {
    color: "#3a7afe",
    marginTop: 6,
    fontSize: 15,
    fontWeight: "600",
  },
  profileAbout: { color: "#bbb", marginTop: 6, fontSize: 13, lineHeight: 18 },
  profileMeta: { color: "#666", marginTop: 8, fontSize: 11 },
  closeModalBtn: {
    alignSelf: "flex-end",
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
});
