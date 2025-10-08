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
import { TextInput as RNTextInput } from "react-native"; // added native input
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const [newChatVisible, setNewChatVisible] = useState(false); // NEW
  const [newChatEmail, setNewChatEmail] = useState(""); // NEW
  const [newChatChecking, setNewChatChecking] = useState(false); // NEW
  const [newChatExists, setNewChatExists] = useState(null); // true/false/null
  const [archivedChats, setArchivedChats] = useState(new Set()); // new
  const [showArchivedView, setShowArchivedView] = useState(false); // new
  const [starredChats, setStarredChats] = useState(new Set()); // new
  const [chatActionEmail, setChatActionEmail] = useState(null); // long-press target
  const [chatActionVisible, setChatActionVisible] = useState(false); // long-press modal
  const [profileViewingEmail, setProfileViewingEmail] = useState(null); // which profile
  const [profileEditMode, setProfileEditMode] = useState(false); // edit toggle
  const [profileForm, setProfileForm] = useState({
    name: "",
    about: "",
    avatar_url: "",
  }); // form
  const [contactAvatars, setContactAvatars] = useState({}); // email -> avatar_url|null
  const [myAvatar, setMyAvatar] = useState(null); // current user avatar
  const navigation = useNavigation();
  const debounceRef = useRef(null); // NEW debounce timer
  const [toast, setToast] = useState(null); // { msg, type } type: 'success'|'error'
  const toastTimerRef = useRef(null);

  // === AUTO EMAIL EXISTENCE CHECK (debounced) ===
  useEffect(() => {
    if (!newChatVisible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // reset state when typing
    setNewChatExists(null);
    if (!newChatEmail.includes("@") || newChatEmail.trim().length < 5) return;
    debounceRef.current = setTimeout(async () => {
      setNewChatChecking(true);
      try {
        await API.get(
          `/users/search?email=${encodeURIComponent(newChatEmail.trim())}`
        );
        setNewChatExists(true);
      } catch {
        setNewChatExists(false);
      } finally {
        setNewChatChecking(false);
      }
    }, 550);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [newChatEmail, newChatVisible]);

  // === Added missing callbacks ===
  const testConnection = useCallback(async () => {
    try {
      const { data } = await API.get("/testdb");
      showToast(
        data?.status ? `Server: ${data.status}` : "Server OK",
        "success"
      );
    } catch (e) {
      showToast(e.message || "Connection Failed", "error");
    }
  }, [showToast]);

  const deleteAccount = useCallback(() => {
    Alert.alert("Delete Account", "This cannot be undone. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete("/account");
            showToast("Account deleted", "success");
            logout?.();
          } catch (e) {
            showToast(e.message || "Delete failed", "error");
          }
        },
      },
    ]);
  }, [logout, showToast]);

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

  // Load archived & starred sets
  useEffect(() => {
    (async () => {
      try {
        const [a, s] = await AsyncStorage.multiGet([
          "archivedChats",
          "starredChats",
        ]);
        if (a?.[1]) setArchivedChats(new Set(JSON.parse(a[1])));
        if (s?.[1]) setStarredChats(new Set(JSON.parse(s[1])));
      } catch {}
    })();
  }, []);

  // Persist archives & stars
  useEffect(() => {
    AsyncStorage.setItem(
      "archivedChats",
      JSON.stringify(Array.from(archivedChats))
    ).catch(() => {});
  }, [archivedChats]);
  useEffect(() => {
    AsyncStorage.setItem(
      "starredChats",
      JSON.stringify(Array.from(starredChats))
    ).catch(() => {});
  }, [starredChats]);

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
    let list = Array.from(map.values());
    // Separate archives
    list = list.filter((c) =>
      showArchivedView
        ? archivedChats.has(c.email)
        : !archivedChats.has(c.email)
    );
    // Star priority
    list.sort((a, b) => {
      const aStar = starredChats.has(a.email);
      const bStar = starredChats.has(b.email);
      if (aStar && !bStar) return -1;
      if (bStar && !aStar) return 1;
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });
    return list;
  }, [messages, userEmail, archivedChats, showArchivedView, starredChats]);

  // Filter contacts by search
  const filtered = contacts.filter(
    (c) =>
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Unified profile open
  const openProfile = useCallback(
    async (email) => {
      setProfileViewingEmail(email);
      setProfileModalVisible(true);
      setProfileLoading(true);
      setProfileError(null);
      setProfileData(null);
      setProfileEditMode(false);
      try {
        if (email === userEmail) {
          const { data } = await API.get("/profile");
          setProfileData(data);
          setProfileForm({
            name: data?.name || "",
            about: data?.about || "",
            avatar_url: data?.avatar_url || "",
          });
        } else {
          const { data } = await API.get(
            `/users/search?email=${encodeURIComponent(email)}`
          );
          setProfileData(data);
        }
      } catch (e) {
        setProfileError(e.message);
      } finally {
        setProfileLoading(false);
      }
    },
    [userEmail]
  );

  // Override old openProfileModal (for menu "My Profile")
  const openProfileModal = useCallback(
    () => openProfile(userEmail, false),
    [openProfile, userEmail]
  );

  const enableEditMyProfile = () => {
    if (profileViewingEmail === userEmail) setProfileEditMode(true);
  };

  const saveMyProfile = useCallback(async () => {
    if (profileViewingEmail !== userEmail) return;
    try {
      setProfileLoading(true);
      setProfileError(null);
      const method = profileData ? "put" : "post";
      const payload = {
        name: profileForm.name.trim(),
        about: profileForm.about.trim(),
        avatar_url: profileForm.avatar_url.trim(),
      };
      const { data } = await API[method]("/profile", payload);
      setProfileData(data);
      setProfileEditMode(false);
      showToast("Profile saved", "success");
    } catch (e) {
      setProfileError(e.message);
      showToast(e.message || "Save failed", "error");
    } finally {
      setProfileLoading(false);
    }
  }, [profileViewingEmail, userEmail, profileForm, profileData, showToast]);

  // Chat actions
  const toggleArchive = useCallback((email) => {
    setArchivedChats((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
    setChatActionVisible(false);
  }, []);
  const toggleStar = useCallback((email) => {
    setStarredChats((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
    setChatActionVisible(false);
  }, []);
  const deleteChat = useCallback(
    async (email) => {
      try {
        await API.delete(`/messages/${encodeURIComponent(email)}`);
        setMessages((prev) =>
          prev.filter(
            (m) =>
              !(
                (m.sender_email === userEmail && m.receiver_email === email) ||
                (m.receiver_email === userEmail && m.sender_email === email)
              )
          )
        );
        setArchivedChats((prev) => {
          const next = new Set(prev);
          next.delete(email);
          return next;
        });
        setStarredChats((prev) => {
          const next = new Set(prev);
          next.delete(email);
          return next;
        });
      } catch (e) {
        Alert.alert("Error", e.message);
      } finally {
        setChatActionVisible(false);
      }
    },
    [userEmail]
  );

  // Long press handler
  const onLongPressChat = (email) => {
    setChatActionEmail(email);
    setChatActionVisible(true);
  };

  // Fetch my avatar once
  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      try {
        const { data } = await API.get("/profile");
        if (data?.avatar_url) setMyAvatar(data.avatar_url);
      } catch {}
    })();
  }, [userEmail]);

  // Fetch avatars for contacts (simple incremental)
  useEffect(() => {
    const toFetch = contacts
      .map((c) => c.email)
      .filter((e) => contactAvatars[e] === undefined);
    if (!toFetch.length) return;
    let cancelled = false;
    (async () => {
      for (const email of toFetch) {
        try {
          const { data } = await API.get(
            `/users/search?email=${encodeURIComponent(email)}`
          );
          if (!cancelled) {
            setContactAvatars((prev) => ({
              ...prev,
              [email]: data?.avatar_url || null,
            }));
          }
        } catch {
          if (!cancelled) {
            setContactAvatars((prev) => ({ ...prev, [email]: null }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts, contactAvatars]);

  const showToast = useCallback((msg, type = "success", duration = 2800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: PALETTE.bg }]}>
      {/* Outside tap to close dropdown */}
      {showMenu && (
        <Pressable
          onPress={() => setShowMenu(false)}
          style={styles.fullscreenOverlay}
        >
          <View />
        </Pressable>
      )}
      {/* Action sheet overlay already handled by its own modal */}
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
            style={[styles.avatarMini, { marginLeft: 4, overflow: "hidden" }]}
            onPress={() => setShowMenu((v) => !v)}
          >
            {myAvatar ? (
              <Image
                source={{ uri: myAvatar }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Text style={styles.avatarMiniTxt}>
                {userEmail?.[0]?.toUpperCase() || "U"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.searchRevertBar}>
          <TouchableOpacity
            style={styles.searchRevertIconBtn}
            onPress={() => {
              setShowSearch(false);
              setSearchQuery("");
            }}
          >
            <Icon name="arrow-back" size={20} color="#9ab1c1" />
          </TouchableOpacity>
          <RNTextInput
            style={styles.searchRevertInput}
            placeholder="Search chats"
            placeholderTextColor="#6d7d92"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            selectionColor="#3a7afe"
          />
          {!!searchQuery && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.searchRevertIconBtn}
            >
              <Icon name="close" size={18} color="#9ab1c1" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Dropdown Menu with Icons (removed Edit My Profile) */}
      {showMenu && !showSearch && (
        <View style={styles.menu}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              openProfile(userEmail);
            }}
          >
            <Icon
              name="person"
              size={16}
              color="#3a7afe"
              style={styles.menuIcon}
            />
            <Text style={styles.menuTxt}>My Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              testConnection();
            }}
          >
            <Icon
              name="wifi-tethering"
              size={16}
              color="#3a7afe"
              style={styles.menuIcon}
            />
            <Text style={styles.menuTxt}>Test Connection</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              deleteAccount();
            }}
          >
            <Icon
              name="delete-forever"
              size={16}
              color="#ff7777"
              style={styles.menuIcon}
            />
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
            <Icon
              name="logout"
              size={16}
              color="#ff6b6b"
              style={styles.menuIcon}
            />
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
            <TouchableOpacity
              style={styles.archivedRow}
              onPress={() => {
                if (!showArchivedView) setShowArchivedView(true);
                else setShowArchivedView(false);
              }}
            >
              <Icon
                name="archive"
                size={22}
                color={PALETTE.textSecondary}
                style={{ marginRight: 16 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.archivedText}>
                  {showArchivedView
                    ? "Chats"
                    : `Archived (${archivedChats.size})`}
                </Text>
                <Text style={styles.archivedSub}>
                  {showArchivedView
                    ? "Return to all chats"
                    : "Long press chat to archive"}
                </Text>
              </View>
            </TouchableOpacity>
            {!showArchivedView && (
              <Text style={styles.hintTxt}>
                Tap and hold a chat for options
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const unreadCount = messages.filter(
            (m) =>
              m.sender_email === item.email &&
              m.receiver_email === userEmail &&
              !m.read
          ).length;
          const starred = starredChats.has(item.email);
          const avatar = contactAvatars[item.email];
          return (
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.avatar, { overflow: "hidden" }]}
                onPress={() => openProfile(item.email)}
              >
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <Text style={styles.avatarTxt}>
                    {item.email.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate("ChatWindow", { contact: item.email })
                }
                onLongPress={() => onLongPressChat(item.email)}
                delayLongPress={320}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.email}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {starred && (
                      <Icon
                        name="star"
                        size={14}
                        color={PALETTE.brandAccent}
                        style={{ marginRight: 4 }}
                      />
                    )}
                    <Text style={styles.time}>
                      {item.lastMessageTime &&
                        new Date(item.lastMessageTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                    </Text>
                  </View>
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
              </TouchableOpacity>
            </View>
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
        onPress={() => {
          setNewChatEmail("");
          setNewChatExists(null);
          setNewChatVisible(true);
        }}
        onLongPress={() => setShowSearch(true)}
        delayLongPress={350}
      >
        <Icon name="chat" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Chat long-press action modal */}
      <Modal
        transparent
        visible={chatActionVisible}
        animationType="fade"
        onRequestClose={() => setChatActionVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setChatActionVisible(false)}
        >
          <View />
        </Pressable>
        <View style={[styles.actionSheet]}>
          <Text style={styles.sheetTitle}>{chatActionEmail}</Text>
          <TouchableOpacity
            style={styles.sheetBtn}
            onPress={() => toggleStar(chatActionEmail)}
          >
            <Icon
              name={starredChats.has(chatActionEmail) ? "star" : "star-border"}
              size={16}
              color="#ffd54f"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.sheetBtnTxt}>
              {starredChats.has(chatActionEmail) ? "Unstar" : "Star"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetBtn}
            onPress={() => toggleArchive(chatActionEmail)}
          >
            <Icon
              name={
                archivedChats.has(chatActionEmail) ? "unarchive" : "archive"
              }
              size={16}
              color="#75b4ff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.sheetBtnTxt}>
              {archivedChats.has(chatActionEmail) ? "Unarchive" : "Archive"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetBtn}
            onPress={() => {
              setChatActionVisible(false);
              openProfile(chatActionEmail, false);
            }}
          >
            <Icon
              name="person"
              size={16}
              color="#3a7afe"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.sheetBtnTxt}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetBtn}
            onPress={() => deleteChat(chatActionEmail)}
          >
            <Icon
              name="delete"
              size={16}
              color="#ff6666"
              style={{ marginRight: 8 }}
            />
            <Text style={[styles.sheetBtnTxt, { color: "#ff6666" }]}>
              Delete Chat
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sheetBtn, { justifyContent: "center" }]}
            onPress={() => setChatActionVisible(false)}
          >
            <Text style={[styles.sheetBtnTxt, { color: "#8696a0" }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Profile Modal redesigned */}
      <Modal
        transparent
        visible={profileModalVisible}
        animationType="fade"
        onRequestClose={() => {
          if (!profileLoading) setProfileModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !profileLoading && setProfileModalVisible(false)}
        >
          <View />
        </Pressable>
        <View style={[styles.modalCard, { paddingTop: 22 }]}>
          {profileLoading ? (
            <ActivityIndicator color="#3a7afe" />
          ) : profileError ? (
            <Text style={{ color: "#f55" }}>{profileError}</Text>
          ) : (
            <>
              <View style={styles.profileHeaderRow}>
                <View style={styles.profileAvatarWrap}>
                  {profileViewingEmail === userEmail &&
                  profileEditMode ? null : profileData?.avatar_url ? (
                    <Image
                      source={{ uri: profileData.avatar_url }}
                      style={styles.profileAvatarLarge}
                    />
                  ) : profileViewingEmail === userEmail &&
                    profileForm.avatar_url &&
                    !profileEditMode ? (
                    <Image
                      source={{ uri: profileForm.avatar_url }}
                      style={styles.profileAvatarLarge}
                    />
                  ) : (
                    <View style={styles.profileAvatarFallback}>
                      <Text style={styles.profileAvatarFallbackTxt}>
                        {profileViewingEmail?.[0]?.toUpperCase() || "U"}
                      </Text>
                    </View>
                  )}
                </View>
                {profileViewingEmail === userEmail && (
                  <TouchableOpacity
                    style={styles.inlineEditBtn}
                    onPress={() => setProfileEditMode((m) => !m)}
                  >
                    <Icon
                      name={profileEditMode ? "close" : "edit"}
                      size={18}
                      color="#fff"
                    />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.profileEmail}>{profileViewingEmail}</Text>

              {profileViewingEmail === userEmail && profileEditMode ? (
                <>
                  {/* editable inputs keep white text */}
                  <RNTextInput
                    style={styles.editInput}
                    placeholder="Name"
                    placeholderTextColor="#77818c"
                    value={profileForm.name}
                    onChangeText={(v) =>
                      setProfileForm((f) => ({ ...f, name: v }))
                    }
                  />
                  <RNTextInput
                    style={[styles.editInput, { height: 80 }]}
                    placeholder="About"
                    placeholderTextColor="#77818c"
                    multiline
                    value={profileForm.about}
                    onChangeText={(v) =>
                      setProfileForm((f) => ({ ...f, about: v }))
                    }
                  />
                  <RNTextInput
                    style={styles.editInput}
                    placeholder="Avatar URL"
                    placeholderTextColor="#77818c"
                    autoCapitalize="none"
                    value={profileForm.avatar_url}
                    onChangeText={(v) =>
                      setProfileForm((f) => ({ ...f, avatar_url: v }))
                    }
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => {
                        setProfileEditMode(false);
                        if (profileData) {
                          setProfileForm({
                            name: profileData.name || "",
                            about: profileData.about || "",
                            avatar_url: profileData.avatar_url || "",
                          });
                        }
                      }}
                    >
                      <Text style={styles.cancelTxt}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBtn}
                      onPress={saveMyProfile}
                    >
                      <Text style={styles.saveTxt}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.heading}>Name</Text>
                  <Text style={styles.profileNameValue}>
                    {profileData?.name || "—"}
                  </Text>
                  <Text style={styles.heading}>About</Text>
                  <Text style={styles.profileAbout}>
                    {profileData?.about || "—"}
                  </Text>
                  <Text style={styles.heading}>Email</Text>
                  <Text style={styles.profileMetaLine}>
                    {profileViewingEmail}
                  </Text>
                  <Text style={styles.heading}>Avatar URL</Text>
                  <Text style={styles.profileMetaLine}>
                    {profileData?.avatar_url || "—"}
                  </Text>
                </>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* New Chat Modal input already white text & outside tap implemented */}
      <Modal
        transparent
        visible={newChatVisible}
        animationType="slide"
        onRequestClose={() => !newChatChecking && setNewChatVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => !newChatChecking && setNewChatVisible(false)}
        >
          <View />
        </Pressable>
        <View style={[styles.modalCard, { top: "24%" }]}>
          <Text style={styles.profileEmail}>Start New Chat</Text>
          <Text style={styles.profileMeta}>
            Enter an email. User existence auto‑checks.
          </Text>
          <RNTextInput
            style={styles.broadcastInput}
            placeholder="user@example.com"
            placeholderTextColor={PALETTE.textSecondary}
            value={newChatEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={(v) => setNewChatEmail(v)} // changed: removed .trim()
          />
          <View style={{ minHeight: 26, justifyContent: "center" }}>
            {newChatChecking && (
              <ActivityIndicator size="small" color="#3a7afe" />
            )}
            {newChatExists === true && (
              <Text style={{ color: "#33d18e", fontSize: 12 }}>
                User found. You can open the chat.
              </Text>
            )}
            {newChatExists === false && (
              <Text style={{ color: "#ff7777", fontSize: 12 }}>
                No user with that email.
              </Text>
            )}
          </View>
          <View style={styles.broadcastActions}>
            <TouchableOpacity
              style={styles.bcBtnCancel}
              disabled={newChatChecking}
              onPress={() => setNewChatVisible(false)}
            >
              <Text style={styles.bcBtnCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.bcBtnSend,
                (newChatExists !== true || newChatChecking) && { opacity: 0.4 },
              ]}
              disabled={newChatExists !== true || newChatChecking}
              onPress={() => {
                setNewChatVisible(false);
                navigation.navigate("ChatWindow", {
                  contact: newChatEmail.trim(),
                });
              }}
            >
              <Text style={styles.bcBtnSendTxt}>Open Chat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View
          style={[
            styles.toastWrap,
            toast.type === "error" ? styles.toastError : styles.toastSuccess,
          ]}
        >
          <Icon
            name={toast.type === "error" ? "error-outline" : "check-circle"}
            size={16}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.toastTxt}>{toast.msg}</Text>
        </View>
      )}
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
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  menuIcon: { marginRight: 10 },
  menuTxt: { color: "#e9edef", fontSize: 13 },
  searchRevertBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#152632",
    marginHorizontal: 10,
    marginTop: (StatusBar.currentHeight || 0) + 6,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#203747",
    paddingHorizontal: 4,
    height: 50,
  },
  searchRevertIconBtn: {
    width: 42,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRevertInput: {
    flex: 1,
    color: "#e9edef",
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 4,
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
    // adjust to prevent cramped look
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12, // slightly larger
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
    marginRight: 12,
    overflow: "hidden",
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
    // enforce white text
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
  actionSheet: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
    backgroundColor: "#162536",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#26405a",
  },
  sheetTitle: {
    color: "#e9edef",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  sheetBtnTxt: { color: "#e9edef", fontSize: 13, fontWeight: "500" },
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  profileAvatarWrap: { width: 72, height: 72 },
  profileAvatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1e2d3a",
  },
  profileAvatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#25384a",
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarFallbackTxt: {
    color: "#e9edef",
    fontSize: 24,
    fontWeight: "700",
  },
  inlineEditBtn: {
    marginLeft: 16,
    backgroundColor: "#2c4052",
    padding: 8,
    borderRadius: 18,
  },
  editInput: {
    backgroundColor: "#202f3d",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e9edef",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "#2e465a",
    marginTop: 10,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#273642",
    marginRight: 8,
  },
  cancelTxt: { color: "#9aa8b3", fontSize: 13, fontWeight: "500" },
  saveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#3a7afe",
  },
  saveTxt: { color: "#fff", fontSize: 13, fontWeight: "600" },
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
  profileMetaLine: {
    color: "#b9c5d1",
    fontSize: 12,
    marginTop: 2,
  },
  // ensure search input text white
  searchRevertInput: {
    // ...existing properties...
    color: "#e9edef",
  },
  toastWrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 90,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    elevation: 6,
  },
  toastSuccess: {
    backgroundColor: "#1d3d55",
    borderWidth: 1,
    borderColor: "#2e5d7d",
  },
  toastError: {
    backgroundColor: "#552222",
    borderWidth: 1,
    borderColor: "#7d3a3a",
  },
  toastTxt: { color: "#fff", fontSize: 13, flexShrink: 1 },
});
