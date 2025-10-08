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
  Alert,
} from "react-native";
import API from "../api";
import { AuthContext } from "../AuthContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import { TextInput } from "react-native-paper";

// Replace STYLE palette + UI layout
const PALETTE = {
  brandBar: "#14233a", // deep bg matching icon shadow
  brandAccent: "#3a7afe",
  bg: "#0b141a",
  bgList: "#111b21",
  row: "#121d2b",
  rowBorder: "#1f2c34",
  textPrimary: "#e9edef",
  textSecondary: "#8696a0",
  accentSoft: "#2b5fcc",
};

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
  const [showSearch, setShowSearch] = useState(false); // new
  const [broadcastVisible, setBroadcastVisible] = useState(false); // new
  const [broadcastRecipients, setBroadcastRecipients] = useState(""); // new
  const [broadcastContent, setBroadcastContent] = useState(""); // new
  const [sendingBroadcast, setSendingBroadcast] = useState(false); // new
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

  const testConnection = useCallback(async () => {
    try {
      const { data } = await API.get("/testdb");
      Alert.alert("Server OK", `Status: ${data.status || "success"}`);
    } catch (e) {
      Alert.alert("Connection Failed", e.message);
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    Alert.alert("Delete Account", "This cannot be undone. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete("/account");
            logout?.();
          } catch (e) {
            Alert.alert("Error", e.message);
          }
        },
      },
    ]);
  }, [logout]);

  const sendBroadcast = useCallback(async () => {
    const emails = broadcastRecipients
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@") && e !== userEmail);
    if (!emails.length || !broadcastContent.trim()) {
      Alert.alert("Missing Data", "Provide recipients & content.");
      return;
    }
    setSendingBroadcast(true);
    try {
      await API.post("/messages/multi", {
        receiver_emails: emails,
        content: broadcastContent.trim(),
      });
      setBroadcastContent("");
      setBroadcastRecipients("");
      setBroadcastVisible(false);
      loadMessages();
      Alert.alert("Sent", "Broadcast delivered.");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSendingBroadcast(false);
    }
  }, [broadcastRecipients, broadcastContent, userEmail, loadMessages]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: PALETTE.bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Top Bar */}
      {!showSearch ? (
        <View style={styles.topBar}>
          <Image
            source={require("../../assets/logo.png")}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.topIcon}
            onPress={() => setShowSearch(true)}
          >
            <Icon name="search" size={22} color={PALETTE.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.avatarMini, { marginLeft: 4 }]}
            onPress={() => setShowMenu((v) => !v)}
          >
            <Text style={styles.avatarMiniTxt}>
              {userEmail?.[0]?.toUpperCase() || "U"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.searchBarRow}>
          <TouchableOpacity
            style={styles.topIcon}
            onPress={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
          >
            <Icon name="arrow-back" size={22} color={PALETTE.textPrimary} />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInputFull}
            placeholder="Search..."
            placeholderTextColor={PALETTE.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {/* Overflow Menu */}
      {showMenu && !showSearch && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              openProfileModal();
            }}
          >
            <Text style={styles.menuTxt}>My Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              setBroadcastVisible(true);
            }}
          >
            <Text style={styles.menuTxt}>Broadcast Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              testConnection();
            }}
          >
            <Text style={styles.menuTxt}>Test Connection</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              deleteAccount();
            }}
          >
            <Text style={[styles.menuTxt, { color: "#ff7777" }]}>
              Delete Account
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              logout?.();
            }}
          >
            <Text style={[styles.menuTxt, { color: "#ff6b6b" }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chats List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.email}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            {/* Archived stub */}
            <TouchableOpacity style={styles.archivedRow}>
              <Icon
                name="archive"
                size={22}
                color={PALETTE.textSecondary}
                style={{ marginRight: 16 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.archivedText}>Archived</Text>
                <Text style={styles.archivedSub}>0 chats</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.hintTxt}>
              Tap and hold a chat for more options
            </Text>
          </View>
        }
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
              onLongPress={() => {
                // placeholder for future contextual menu
              }}
              delayLongPress={300}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>
                  {item.email.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.email}
                  </Text>
                  <Text style={styles.time}>
                    {item.lastMessageTime &&
                      new Date(item.lastMessageTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text
                    style={styles.preview}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.lastMessage || "No messages yet"}
                  </Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeTxt}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: PALETTE.textSecondary }}>
              No conversations
            </Text>
          </View>
        }
      />

      {/* Encryption note */}
      <View style={styles.encryptNoteWrap}>
        <Text style={styles.encryptNote}>
          Your personal messages are end‑to‑end encrypted
        </Text>
      </View>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: PALETTE.brandAccent }]}
        onPress={() => setBroadcastVisible(true)}
        onLongPress={() => setShowSearch(true)}
        delayLongPress={350}
      >
        <Icon name="chat" size={26} color="#fff" />
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

      {/* Broadcast Modal */}
      <Modal
        transparent
        visible={broadcastVisible}
        animationType="slide"
        onRequestClose={() => !sendingBroadcast && setBroadcastVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !sendingBroadcast && setBroadcastVisible(false)}
        >
          <View />
        </Pressable>
        <View style={[styles.modalCard, { top: "18%" }]}>
          <Text style={styles.profileEmail}>Broadcast</Text>
          <Text style={styles.profileMeta}>
            Separate multiple emails with commas or spaces.
          </Text>
          <TextInput
            style={styles.broadcastInput}
            placeholder="Recipients (emails)"
            placeholderTextColor={PALETTE.textSecondary}
            value={broadcastRecipients}
            onChangeText={setBroadcastRecipients}
            autoCapitalize="none"
            multiline
          />
          <TextInput
            style={[styles.broadcastInput, { height: 90 }]}
            placeholder="Message content"
            placeholderTextColor={PALETTE.textSecondary}
            value={broadcastContent}
            onChangeText={setBroadcastContent}
            multiline
          />
          <View style={styles.broadcastActions}>
            <TouchableOpacity
              style={styles.bcBtnCancel}
              disabled={sendingBroadcast}
              onPress={() => setBroadcastVisible(false)}
            >
              <Text style={styles.bcBtnCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bcBtnSend, sendingBroadcast && { opacity: 0.6 }]}
              disabled={sendingBroadcast}
              onPress={sendBroadcast}
            >
              {sendingBroadcast ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.bcBtnSendTxt}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
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
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: (StatusBar.currentHeight || 0) + 4,
    paddingBottom: 10,
    backgroundColor: PALETTE.brandBar,
  },
  logoImg: { width: 40, height: 40, marginRight: 6 },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  topIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMini: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1f2c34",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMiniTxt: { color: "#e9edef", fontWeight: "600" },
  menu: {
    position: "absolute",
    top: (StatusBar.currentHeight || 0) + 58,
    right: 8,
    backgroundColor: "#132235",
    borderRadius: 8,
    paddingVertical: 6,
    minWidth: 170,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#20344e",
    zIndex: 50,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 10 },
  menuTxt: { color: "#e9edef", fontSize: 13 },
  searchBarRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2c34",
    paddingTop: (StatusBar.currentHeight || 0) + 4,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  searchInputFull: {
    flex: 1,
    backgroundColor: "#233138",
    marginRight: 10,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: "#e9edef",
    fontSize: 14,
  },
  archivedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111b21",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2c34",
  },
  archivedText: { color: "#e9edef", fontWeight: "600", fontSize: 14 },
  archivedSub: { color: "#8696a0", fontSize: 11, marginTop: 2 },
  hintTxt: {
    color: "#8696a0",
    fontSize: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: PALETTE.row,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2c34",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#233138",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarTxt: { color: "#e9edef", fontWeight: "600", fontSize: 13 },
  rowTop: { flexDirection: "row", alignItems: "center" },
  name: { flex: 1, color: "#e9edef", fontSize: 15, fontWeight: "600" },
  time: { color: "#8696a0", fontSize: 11, marginLeft: 8 },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  preview: {
    flex: 1,
    color: "#8696a0",
    fontSize: 12,
  },
  unreadBadge: {
    marginLeft: 8,
    minWidth: 20,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: PALETTE.brandAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeTxt: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  empty: { padding: 60, alignItems: "center" },
  fab: {
    position: "absolute",
    right: 22,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PALETTE.brandAccent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#3a7afe",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  encryptNoteWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 6,
    alignItems: "center",
  },
  encryptNote: {
    fontSize: 11,
    color: "#8696a0",
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
  broadcastInput: {
    backgroundColor: "#1a2b42",
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#253a57",
  },
  broadcastActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
  },
  bcBtnCancel: { paddingHorizontal: 14, paddingVertical: 10 },
  bcBtnCancelTxt: { color: "#8696a0", fontSize: 14 },
  bcBtnSend: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#3a7afe",
    borderRadius: 24,
    marginLeft: 4,
  },
  bcBtnSendTxt: { color: "#fff", fontWeight: "600" },
});
