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
  Modal,
  Pressable,
  Image, // for avatar display in profile viewer
} from "react-native";
import { TextInput } from "react-native-paper";
import API from "../api";
import ContactList from "../components/ContactList";
import ChatWindow from "../components/ChatWindow";
import { AuthContext } from "../AuthContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Clipboard } from "react-native"; // (Expo SDK < 49 uses expo-clipboard; adjust if needed)

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
  const [chatMenuOpen, setChatMenuOpen] = useState(false); // new
  const [profileModalVisible, setProfileModalVisible] = useState(false); // new
  const [profileLoading, setProfileLoading] = useState(false); // new
  const [profileData, setProfileData] = useState(null); // new
  const [profileError, setProfileError] = useState(null); // new
  const [deleteInfo, setDeleteInfo] = useState(null); // new banner after delete
  const [myProfileModalVisible, setMyProfileModalVisible] = useState(false); // editor modal
  const [myProfileLoading, setMyProfileLoading] = useState(false);
  const [myProfileError, setMyProfileError] = useState(null);
  const [myProfileData, setMyProfileData] = useState(null);
  const [myProfileSaving, setMyProfileSaving] = useState(false);
  const [myProfileForm, setMyProfileForm] = useState({
    name: "",
    about: "",
    avatar_url: "",
  });
  const [msgSelectionMode, setMsgSelectionMode] = useState(false); // new
  const [selectedMsgIds, setSelectedMsgIds] = useState(new Set()); // new
  const [markingRead, setMarkingRead] = useState(false); // new

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

  const fetchProfile = useCallback(async () => {
    if (!activeContact) return;
    setProfileLoading(true);
    setProfileError(null);
    setProfileData(null);
    try {
      const res = await fetch(
        `https://wirewaveapi.onrender.com/users/search?email=${encodeURIComponent(
          activeContact
        )}`,
        {
          headers: {
            Authorization: global.authToken
              ? `Bearer ${global.authToken}`
              : undefined,
          },
        }
      );
      const data = await res.json();
      // API may return array or object
      const entry = Array.isArray(data) ? data[0] : data;
      setProfileData(entry || {});
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileLoading(false);
      setProfileModalVisible(true);
    }
  }, [activeContact]);

  // ===== Delete Chat (parse server response) =====
  const deleteChat = useCallback(async () => {
    if (!activeContact) return;
    try {
      const res = await fetch(
        `https://wirewaveapi.onrender.com/messages/${encodeURIComponent(
          activeContact
        )}`,
        {
          method: "DELETE",
          headers: {
            Authorization: global.authToken
              ? `Bearer ${global.authToken}`
              : undefined,
          },
        }
      );
      let serverMsg = "";
      try {
        const json = await res.json();
        if (json?.message) {
          serverMsg = json.message;
        } else if (json?.success) {
          serverMsg = `Deleted ${json.deletedCount || 0} messages`;
        }
      } catch {
        /* ignore */
      }
      // Remove chat locally
      setMessages((prev) =>
        prev.filter(
          (m) =>
            !(
              (m.sender_email === activeContact &&
                m.receiver_email === userEmail) ||
              (m.receiver_email === activeContact &&
                m.sender_email === userEmail)
            )
        )
      );
      setActiveContact(null);
      setChatMenuOpen(false);
      if (serverMsg) {
        setDeleteInfo(serverMsg);
        setTimeout(() => setDeleteInfo(null), 4000);
      }
    } catch (e) {
      setError(e.message || "Delete failed");
    }
  }, [activeContact, userEmail]);

  // bulk delete handler
  const bulkDeleteChats = useCallback(
    async (emails) => {
      if (!emails?.length) return;
      try {
        await Promise.all(
          emails.map((em) =>
            API.delete(`/messages/${encodeURIComponent(em)}`).catch(() => null)
          )
        );
      } catch (e) {
        setError(e.message || "Bulk delete failed");
      } finally {
        setMessages((prev) =>
          prev.filter((m) => {
            const peer =
              m.sender_email === userEmail ? m.receiver_email : m.sender_email;
            return !emails.includes(peer);
          })
        );
        if (activeContact && emails.includes(activeContact)) {
          setActiveContact(null);
        }
      }
    },
    [activeContact, userEmail]
  );

  const bottomInset = composerHeight + 8; // space for last bubble

  // ===== My Profile Editor =====
  const openMyProfile = useCallback(async () => {
    setMyProfileModalVisible(true);
    setMyProfileLoading(true);
    setMyProfileError(null);
    setMyProfileData(null);
    try {
      const { data } = await API.get("/profile");
      setMyProfileData(data);
      setMyProfileForm({
        name: data?.name || "",
        about: data?.about || "",
        avatar_url: data?.avatar_url || "",
      });
    } catch (e) {
      // If 404 (no profile yet) allow creation
      setMyProfileError(e.message);
    } finally {
      setMyProfileLoading(false);
    }
  }, []);

  const saveMyProfile = useCallback(async () => {
    setMyProfileSaving(true);
    setMyProfileError(null);
    try {
      const method =
        myProfileData &&
        (myProfileData.name || myProfileData.about || myProfileData.avatar_url)
          ? "PUT"
          : "POST";
      const endpoint = "/profile";
      const payload = {
        name: myProfileForm.name.trim(),
        about: myProfileForm.about.trim(),
        avatar_url: myProfileForm.avatar_url.trim(),
      };
      const res =
        method === "POST"
          ? await API.post(endpoint, payload)
          : await API.put(endpoint, payload);
      setMyProfileData(res.data);
      setMyProfileForm({
        name: res.data?.name || "",
        about: res.data?.about || "",
        avatar_url: res.data?.avatar_url || "",
      });
      setDeleteInfo("Profile saved successfully");
      setTimeout(() => setDeleteInfo(null), 4000);
    } catch (e) {
      setMyProfileError(e.message || "Save failed");
    } finally {
      setMyProfileSaving(false);
    }
  }, [myProfileForm, myProfileData]);

  // Helper: toggle message selection
  const toggleSelectMessage = useCallback((id) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size === 0) setMsgSelectionMode(false);
      return next;
    });
  }, []);

  const startMessageSelection = useCallback((id) => {
    setMsgSelectionMode(true);
    setSelectedMsgIds(new Set([id]));
  }, []);

  const clearMessageSelection = useCallback(() => {
    setMsgSelectionMode(false);
    setSelectedMsgIds(new Set());
  }, []);

  // Auto mark unread messages (received) as read when chat opens / updates
  useEffect(() => {
    if (!activeContact || !filtered.length) return;
    const unread = filtered.filter(
      (m) => m.receiver_email === userEmail && !m.read
    );
    if (!unread.length) return;
    let cancelled = false;
    (async () => {
      for (const m of unread) {
        try {
          await API.post("/messages/read", { message_id: m.id });
        } catch {}
        if (cancelled) break;
      }
      // optimistic local state update
      setMessages((prev) =>
        prev.map((msg) =>
          unread.find((u) => u.id === msg.id) ? { ...msg, read: true } : msg
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [activeContact, filtered, userEmail]);

  const markSelectedAsRead = useCallback(async () => {
    const ids = Array.from(selectedMsgIds)
      .map((id) => filtered.find((m) => m.id === id))
      .filter(Boolean)
      .filter((m) => m.receiver_email === userEmail && !m.read);
    if (!ids.length) {
      clearMessageSelection();
      return;
    }
    setMarkingRead(true);
    try {
      await Promise.all(
        ids.map((m) =>
          API.post("/messages/read", { message_id: m.id }).catch(() => null)
        )
      );
      setMessages((prev) =>
        prev.map((m) => (selectedMsgIds.has(m.id) ? { ...m, read: true } : m))
      );
    } finally {
      setMarkingRead(false);
      clearMessageSelection();
    }
  }, [selectedMsgIds, filtered, userEmail, clearMessageSelection]);

  const copySelected = useCallback(() => {
    const texts = Array.from(selectedMsgIds)
      .map((id) => filtered.find((m) => m.id === id))
      .filter(Boolean)
      .map((m) => m.content);
    if (texts.length) {
      try {
        Clipboard.setString?.(texts.join("\n"));
      } catch {}
    }
    clearMessageSelection();
  }, [selectedMsgIds, filtered, clearMessageSelection]);

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
                onBulkDelete={bulkDeleteChats}
                onOpenMyProfile={openMyProfile} // added
              />
            </View>
          )}

          {/* Chat Pane */}
          <View style={styles.chatPane}>
            {/* Header bar with toggle + logout */}
            <View style={styles.headerBar}>
              {/* when in message selection mode replace right menu */}
              {!isWide && !showContacts && !msgSelectionMode && (
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => setShowContacts(true)}
                >
                  <Icon name="menu" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              {msgSelectionMode ? (
                <>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={clearMessageSelection}
                  >
                    <Icon name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                  <View
                    style={[styles.headerCenter, { alignItems: "flex-start" }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600" }}>
                      {selectedMsgIds.size} selected
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={copySelected}
                      disabled={!selectedMsgIds.size}
                    >
                      <Icon name="content-copy" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={markSelectedAsRead}
                      disabled={
                        markingRead ||
                        !Array.from(selectedMsgIds).some((id) => {
                          const m = filtered.find((x) => x.id === id);
                          return m && m.receiver_email === userEmail && !m.read;
                        })
                      }
                    >
                      {markingRead ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Icon name="done-all" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  {!isWide && showContacts && <View style={{ width: 38 }} />}
                  <View style={styles.headerCenter}>
                    {activeContact && (
                      <TouchableOpacity
                        style={styles.chatInfo}
                        onPress={fetchProfile}
                        activeOpacity={0.8}
                      >
                        <View style={styles.avatarSmall}>
                          <Text style={styles.avatarSmallTxt}>
                            {activeContact.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.chatEmail} numberOfLines={1}>
                          {activeContact}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {activeContact ? (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => setChatMenuOpen((v) => !v)}
                    >
                      <Icon name="more-vert" size={22} color="#fff" />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 38 }} />
                  )}
                </>
              )}
            </View>
            {chatMenuOpen && activeContact && (
              <View style={styles.chatMenu}>
                <TouchableOpacity
                  style={styles.chatMenuItem}
                  onPress={() => {
                    setChatMenuOpen(false);
                    fetchProfile();
                  }}
                >
                  <Icon
                    name="person"
                    size={16}
                    color="#fff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.chatMenuTxt}>View Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chatMenuItem}
                  onPress={openMyProfile}
                >
                  <Icon
                    name="account-circle"
                    size={16}
                    color="#fff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.chatMenuTxt}>My Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chatMenuItem}
                  onPress={deleteChat}
                >
                  <Icon
                    name="delete"
                    size={16}
                    color="#ff6666"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.chatMenuTxt, { color: "#ff6666" }]}>
                    Delete Chat
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.chatMenuItem}
                  onPress={() => setChatMenuOpen(false)}
                >
                  <Icon
                    name="close"
                    size={16}
                    color="#aaa"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.chatMenuTxt, { color: "#aaa" }]}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {deleteInfo && (
              <View style={styles.deleteBanner}>
                <Text style={styles.deleteBannerText}>{deleteInfo}</Text>
              </View>
            )}
            {newContactNotice && (
              <View style={styles.noticeBanner}>
                <Text style={styles.noticeText}>
                  New conversation: {newContactNotice}
                </Text>
              </View>
            )}
            {/* Chat window */}
            <ChatWindow
              ref={chatWindowRef}
              activeContact={activeContact}
              messages={filtered}
              currentUserEmail={userEmail}
              onRefresh={loadMessages}
              onClear={clearChat}
              bottomInset={bottomInset}
              selectionMode={msgSelectionMode} // new
              selectedIds={selectedMsgIds} // new
              onToggleSelectMessage={toggleSelectMessage} // new
              onStartSelection={startMessageSelection} // new
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
              <Text style={styles.profileEmail}>{activeContact}</Text>
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
      {/* My Profile Editor Modal */}
      <Modal
        transparent
        visible={myProfileModalVisible}
        animationType="slide"
        onRequestClose={() => setMyProfileModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !myProfileSaving && setMyProfileModalVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.modalCard}>
          <Text style={styles.profileEmail}>My Profile</Text>
          {myProfileLoading ? (
            <ActivityIndicator color="#3a7afe" style={{ marginTop: 12 }} />
          ) : (
            <>
              {myProfileError && (
                <Text style={{ color: "#f55", marginTop: 8 }}>
                  {myProfileError}
                </Text>
              )}
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Name</Text>
                <TextInput
                  value={myProfileForm.name}
                  onChangeText={(v) =>
                    setMyProfileForm((f) => ({ ...f, name: v }))
                  }
                  placeholder="Your display name"
                  placeholderTextColor="#777"
                  style={styles.editInput}
                  textColor="#fff"
                  theme={{
                    colors: {
                      primary: "#3a7afe",
                      background: "#1f1f1f",
                      surface: "#1f1f1f",
                      onSurface: "#fff",
                      text: "#fff",
                    },
                  }}
                  underlineColor="transparent"
                />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>About</Text>
                <TextInput
                  value={myProfileForm.about}
                  onChangeText={(v) =>
                    setMyProfileForm((f) => ({ ...f, about: v }))
                  }
                  placeholder="Something about you"
                  placeholderTextColor="#777"
                  style={[
                    styles.editInput,
                    { height: 70, textAlignVertical: "top" },
                  ]}
                  multiline
                  textColor="#fff"
                  theme={{
                    colors: {
                      primary: "#3a7afe",
                      background: "#1f1f1f",
                      surface: "#1f1f1f",
                      onSurface: "#fff",
                      text: "#fff",
                    },
                  }}
                  underlineColor="transparent"
                />
              </View>
              <View style={styles.editField}>
                <Text style={styles.editLabel}>Avatar URL</Text>
                <TextInput
                  value={myProfileForm.avatar_url}
                  onChangeText={(v) =>
                    setMyProfileForm((f) => ({ ...f, avatar_url: v }))
                  }
                  placeholder="https://..."
                  placeholderTextColor="#777"
                  style={styles.editInput}
                  autoCapitalize="none"
                  textColor="#fff"
                  theme={{
                    colors: {
                      primary: "#3a7afe",
                      background: "#1f1f1f",
                      surface: "#1f1f1f",
                      onSurface: "#fff",
                      text: "#fff",
                    },
                  }}
                  underlineColor="transparent"
                />
              </View>
              {myProfileForm.avatar_url ? (
                <Image
                  source={{ uri: myProfileForm.avatar_url }}
                  style={styles.profileAvatarPreview}
                />
              ) : (
                <View style={styles.profileAvatarFallback}>
                  <Text style={styles.profileAvatarFallbackTxt}>
                    {userEmail?.[0]?.toUpperCase() || "U"}
                  </Text>
                </View>
              )}
              <View style={styles.profileActionsRow}>
                <TouchableOpacity
                  style={[styles.saveBtn, myProfileSaving && { opacity: 0.6 }]}
                  disabled={myProfileSaving}
                  onPress={saveMyProfile}
                >
                  {myProfileSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveBtnTxt}>
                      {myProfileData ? "Update" : "Create"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() =>
                    !myProfileSaving && setMyProfileModalVisible(false)
                  }
                  disabled={myProfileSaving}
                >
                  <Text style={styles.cancelBtnTxt}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
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
  chatMenu: {
    position: "absolute",
    top: 56,
    right: 10,
    backgroundColor: "#1f1f1f",
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 160,
    zIndex: 50,
    elevation: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a2a2a",
  },
  chatMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chatMenuTxt: { color: "#fff", fontSize: 13, fontWeight: "500" },
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
  deleteBanner: {
    backgroundColor: "#2b3d1f",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomColor: "#355026",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deleteBannerText: { color: "#c4f6aa", fontSize: 12 },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  editField: { marginTop: 14 },
  editLabel: { color: "#999", fontSize: 12, marginBottom: 4 },
  editInput: {
    backgroundColor: "#1f1f1f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  profileAvatarPreview: {
    width: 90,
    height: 90,
    borderRadius: 45, // circular now
    marginTop: 12,
    alignSelf: "flex-start",
  },
  profileAvatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#2d2d2d",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#444",
  },
  profileAvatarFallbackTxt: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "700",
  },
  profileActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
  },
  saveBtn: {
    backgroundColor: "#3a7afe",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 26,
  },
  saveBtnTxt: { color: "#fff", fontWeight: "600", fontSize: 14 },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginLeft: 12,
  },
  cancelBtnTxt: { color: "#bbb", fontSize: 14 },
});
