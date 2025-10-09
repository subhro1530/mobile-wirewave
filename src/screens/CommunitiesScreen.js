import React, {
  useEffect,
  useState,
  useCallback,
  useContext,
  useMemo,
  useRef, // ADDED
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
  KeyboardAvoidingView,
  Keyboard,
  Platform, // ADDED
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import API from "../api";
import { AuthContext } from "../AuthContext";
import ChatWindow from "../components/ChatWindow";
import { useNavigation } from "@react-navigation/native"; // ADDED

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
  const { userEmail, userToken } = useContext(AuthContext);
  const navigation = useNavigation(); // ADDED
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [content, setContent] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  // === GROUPS STATE (NEW) ===
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [activeGroupName, setActiveGroupName] = useState("");
  const [groupMsgs, setGroupMsgs] = useState([]);
  const [groupSending, setGroupSending] = useState(false);
  const [groupText, setGroupText] = useState("");
  const [groupEnhancing, setGroupEnhancing] = useState(false);
  const [groupInfoVisible, setGroupInfoVisible] = useState(false);
  const [groupInfoLoading, setGroupInfoLoading] = useState(false);
  const [groupInfo, setGroupInfo] = useState(null); // { group, members }
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [kbVisible, setKbVisible] = useState(false);
  // Create Group modal
  const [createVisible, setCreateVisible] = useState(false);
  const [cgName, setCgName] = useState("");
  const [cgMembers, setCgMembers] = useState(""); // comma/space-separated
  const [cgSubmitting, setCgSubmitting] = useState(false);
  // Broadcast modal
  const [broadcastVisible, setBroadcastVisible] = useState(false);
  const [lastBroadcastInfo, setLastBroadcastInfo] = useState(null); // NEW: fix missing state

  // Group chat composer extras (emoji/share)
  const [groupEmojiVisible, setGroupEmojiVisible] = useState(false); // NEW
  const [groupShareVisible, setGroupShareVisible] = useState(false); // NEW
  const [groupLocSending, setGroupLocSending] = useState(false); // NEW

  // Refs to control polling/throttling
  const groupsTimerRef = useRef(null); // NEW
  const loadGroupsInFlight = useRef(false); // NEW
  const lastGroupsFetchRef = useRef(0); // NEW
  const loadGroupsRef = useRef(null); // NEW
  const groupFetchInFlightRef = useRef(false); // NEW

  // Make auth header stable across renders
  const authHdr = useMemo(
    () => (userToken ? { Authorization: `Bearer ${userToken}` } : undefined),
    [userToken]
  );

  // === CONTACTS for Broadcast: fetch only when modal opens (FIX infinite GET) ===
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await API.get("/messages", { headers: authHdr });
      setMessages(data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [authHdr]);

  // Fetch contacts only when the Broadcast modal opens
  useEffect(() => {
    if (!broadcastVisible) return;
    loadMessages();
  }, [broadcastVisible, loadMessages]);

  // === GROUPS API (throttled, no overlap) ===
  const loadGroups = useCallback(async () => {
    const now = Date.now();
    if (loadGroupsInFlight.current) return; // prevent overlap
    if (now - (lastGroupsFetchRef.current || 0) < 2500) return; // throttle ~2.5s
    loadGroupsInFlight.current = true;
    try {
      setGroupsLoading(true);
      const { data } = await API.get("/groups", { headers: authHdr });
      setGroups(Array.isArray(data) ? data : []);
      lastGroupsFetchRef.current = Date.now();
    } catch {
    } finally {
      setGroupsLoading(false);
      loadGroupsInFlight.current = false;
    }
  }, [authHdr]);

  // Keep latest loader in a ref
  useEffect(() => {
    loadGroupsRef.current = loadGroups;
  }, [loadGroups]);

  // Single mount-time interval; uses ref to latest loader
  useEffect(() => {
    // initial load
    loadGroupsRef.current?.();
    // start interval
    groupsTimerRef.current = setInterval(() => {
      loadGroupsRef.current?.();
    }, 10000);
    return () => {
      if (groupsTimerRef.current) clearInterval(groupsTimerRef.current);
      groupsTimerRef.current = null;
    };
  }, []); // CHANGED: was [loadGroups]

  const openGroup = useCallback((g) => {
    setActiveGroupId(g.id);
    setActiveGroupName(g.name || `Group #${g.id}`);
    setGroupMsgs([]);
    setGroupText("");
  }, []);

  // Group messages poller (guard overlap + avoid no-op state sets)
  useEffect(() => {
    if (!activeGroupId) return;
    let cancel = false;

    const fetchMsgs = async () => {
      if (groupFetchInFlightRef.current) return; // prevent overlap
      groupFetchInFlightRef.current = true;
      try {
        const { data } = await API.get(
          `/groups/${encodeURIComponent(
            activeGroupId
          )}/messages?limit=200&offset=0`,
          { headers: authHdr }
        );
        if (!cancel) {
          const next = Array.isArray(data) ? data : [];
          // Avoid setting state if nothing changed (cheap compare by id/sent_at)
          setGroupMsgs((prev) => {
            if (prev.length === next.length) {
              let same = true;
              for (let i = 0; i < prev.length; i++) {
                if (
                  prev[i]?.id !== next[i]?.id ||
                  prev[i]?.sent_at !== next[i]?.sent_at
                ) {
                  same = false;
                  break;
                }
              }
              if (same) return prev;
            }
            return next;
          });
        }
      } catch {
      } finally {
        groupFetchInFlightRef.current = false;
      }
    };

    fetchMsgs();
    const t = setInterval(fetchMsgs, 4000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [activeGroupId, authHdr]); // unchanged deps

  // Keyboard visibility for insets
  useEffect(() => {
    const s = Keyboard.addListener("keyboardDidShow", () => setKbVisible(true));
    const h = Keyboard.addListener("keyboardDidHide", () =>
      setKbVisible(false)
    );
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  // Group details
  const loadGroupInfo = useCallback(
    async (id) => {
      setGroupInfoLoading(true);
      try {
        const { data } = await API.get(`/groups/${encodeURIComponent(id)}`, {
          headers: authHdr,
        });
        setGroupInfo(data || null);
        const owner = data?.group?.owner_email;
        setIsOwner(owner === userEmail);
        const mine = (data?.members || []).find(
          (m) => m.member_email === userEmail
        );
        setIsAdmin(!!mine?.is_admin || owner === userEmail);
        setRenameValue(data?.group?.name || "");
      } catch (e) {
      } finally {
        setGroupInfoLoading(false);
      }
    },
    [authHdr, userEmail]
  );

  const showGroupInfo = useCallback(() => {
    if (!activeGroupId) return;
    loadGroupInfo(activeGroupId);
    setGroupInfoVisible(true);
  }, [activeGroupId, loadGroupInfo]);

  // Actions
  const sendGroupMessage = useCallback(async () => {
    const draft = groupText.trim();
    if (!draft || !activeGroupId) return;
    setGroupSending(true);
    try {
      const { data } = await API.post(
        `/groups/${encodeURIComponent(activeGroupId)}/messages`,
        { content: draft },
        { headers: authHdr }
      );
      if (data && data.id) setGroupMsgs((p) => [...p, data]);
      setGroupText("");
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Send failed"
      );
    } finally {
      setGroupSending(false);
    }
  }, [groupText, activeGroupId, authHdr]);

  const enhanceGroupText = useCallback(async () => {
    const draft = groupText.trim();
    if (!draft || groupEnhancing) return;
    setGroupEnhancing(true);
    try {
      const payload = {
        text:
          "pls improve this sentence ok, just give the enhanced version without any words from you here is the text: " +
          draft,
      };
      const { data } = await API.post("/ai/enhance-chat", payload, {
        headers: authHdr,
      });
      const out = (data?.enhanced || "").toString().trim();
      if (out) setGroupText(out);
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e.message ||
          "Enhance failed"
      );
    } finally {
      setGroupEnhancing(false);
    }
  }, [groupText, groupEnhancing, authHdr]);

  const createGroup = useCallback(async () => {
    const name = cgName.trim();
    const raw = cgMembers.trim();
    const members = raw
      ? raw
          .split(/[,\s]+/)
          .map((x) => x.trim())
          .filter((x) => x.includes("@") && x !== userEmail)
      : [];
    if (!name) {
      Alert.alert("Missing", "Enter a group name.");
      return;
    }
    setCgSubmitting(true);
    try {
      const { data } = await API.post(
        "/groups",
        { name, members },
        { headers: { ...authHdr, "Content-Type": "application/json" } }
      );
      setCreateVisible(false);
      setCgName("");
      setCgMembers("");
      await loadGroups();
      if (data?.group?.id)
        openGroup({ id: data.group.id, name: data.group.name });
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Create failed"
      );
    } finally {
      setCgSubmitting(false);
    }
  }, [cgName, cgMembers, userEmail, authHdr, loadGroups, openGroup]);

  const renameGroup = useCallback(async () => {
    if (!activeGroupId) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await API.put(
        `/groups/${encodeURIComponent(activeGroupId)}/name`,
        { name },
        { headers: authHdr }
      );
      setActiveGroupName(name);
      await loadGroupInfo(activeGroupId);
      await loadGroups();
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Rename failed"
      );
    }
  }, [activeGroupId, renameValue, authHdr, loadGroupInfo, loadGroups]);

  const addMember = useCallback(async () => {
    const email = addMemberEmail.trim();
    if (!email || !activeGroupId) return;
    try {
      await API.post(
        `/groups/${encodeURIComponent(activeGroupId)}/members`,
        { member_email: email, make_admin: false },
        { headers: authHdr }
      );
      setAddMemberEmail("");
      await loadGroupInfo(activeGroupId);
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Add member failed"
      );
    }
  }, [addMemberEmail, activeGroupId, authHdr, loadGroupInfo]);

  const removeMember = useCallback(
    async (email) => {
      if (!activeGroupId || !email) return;
      try {
        await API.delete(
          `/groups/${encodeURIComponent(
            activeGroupId
          )}/members/${encodeURIComponent(email)}`,
          { headers: authHdr }
        );
        await loadGroupInfo(activeGroupId);
        // Announce removal to the group
        await sendGroupSystemMessage(`${userEmail} removed ${email}`);
      } catch (e) {
        Alert.alert(
          "Error",
          e?.response?.data?.error || e.message || "Remove failed"
        );
      }
    },
    [activeGroupId, authHdr, loadGroupInfo, sendGroupSystemMessage, userEmail]
  );

  const leaveGroup = useCallback(async () => {
    if (!activeGroupId) return;
    try {
      // Announce before leaving so the API still allows sending
      await sendGroupSystemMessage(`${userEmail} left the group`);
      await API.post(
        `/groups/${encodeURIComponent(activeGroupId)}/leave`,
        {},
        { headers: authHdr }
      );
      setActiveGroupId(null);
      setGroupMsgs([]);
      await loadGroups();
      setGroupInfoVisible(false);
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e.message || "Leave failed"
      );
    }
  }, [activeGroupId, authHdr, loadGroups, sendGroupSystemMessage, userEmail]);

  // ADD/RESTORE: deleteGroup action (owner only)
  const deleteGroup = useCallback(async () => {
    if (!activeGroupId) return;
    Alert.alert("Delete Group", "This will delete the group for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await API.delete(`/groups/${encodeURIComponent(activeGroupId)}`, {
              headers: authHdr,
            });
            setActiveGroupId(null);
            setGroupMsgs([]);
            await loadGroups();
            setGroupInfoVisible(false);
          } catch (e) {
            Alert.alert(
              "Error",
              e?.response?.data?.error || e.message || "Delete failed"
            );
          }
        },
      },
    ]);
  }, [activeGroupId, authHdr, loadGroups]);

  // Promote/Demote admin
  const toggleAdmin = useCallback(
    async (email, makeAdmin) => {
      if (!activeGroupId || !email) return;
      try {
        await API.post(
          `/groups/${encodeURIComponent(activeGroupId)}/members`,
          { member_email: email, make_admin: !!makeAdmin },
          { headers: authHdr }
        );
        await loadGroupInfo(activeGroupId);
        await sendGroupSystemMessage(
          makeAdmin
            ? `${userEmail} made ${email} an admin`
            : `${userEmail} removed ${email} as admin`
        );
      } catch (e) {
        Alert.alert(
          "Error",
          e?.response?.data?.error || e.message || "Admin update failed"
        );
      }
    },
    [activeGroupId, authHdr, loadGroupInfo, sendGroupSystemMessage, userEmail]
  );

  // System message helper for group
  const sendGroupSystemMessage = useCallback(
    async (content) => {
      if (!activeGroupId || !content?.trim()) return;
      try {
        await API.post(
          `/groups/${encodeURIComponent(activeGroupId)}/messages`,
          { content: content.trim() },
          { headers: authHdr }
        );
      } catch {
        /* silent */
      }
    },
    [activeGroupId, authHdr]
  );

  // Small emoji set (same idea as direct chat)
  const groupEmojis = [
    "😀",
    "😂",
    "🥰",
    "😍",
    "😎",
    "👍",
    "🙏",
    "🎉",
    "🔥",
    "✨",
  ]; // NEW
  const insertGroupEmoji = useCallback((em) => setGroupText((t) => t + em), []);

  // Derive contacts from messages (for broadcast list)
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

  // Filter contacts by search (used in broadcast modal)
  const filtered = useMemo(() => {
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.lastMessage || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [contacts, search]);

  // Toggle selection for broadcast recipients
  const toggle = useCallback((email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }, []);

  // Send broadcast to selected recipients
  const sendBroadcast = useCallback(async () => {
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
  }, [selected, content, authHdr]);

  // Enhance broadcast text with AI
  const enhanceBroadcast = useCallback(async () => {
    const draft = content.trim();
    if (!draft || enhancing) return;
    setEnhancing(true);
    try {
      const payload = {
        text:
          "pls improve this sentence ok, just give the enhanced version without any words from you here is the text: " +
          draft,
      };
      const { data } = await API.post("/ai/enhance-chat", payload, {
        headers: authHdr,
      });
      const out = (data?.enhanced || "").toString().trim();
      if (out) setContent(out);
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e.message ||
          "Enhance failed"
      );
    } finally {
      setEnhancing(false);
    }
  }, [content, enhancing, authHdr]);

  // Hide tab bar while inside a group chat (restores automatically)
  useEffect(() => {
    const parent = navigation.getParent?.();
    if (!parent) return;
    if (activeGroupId) parent.setOptions({ tabBarStyle: { display: "none" } });
    else parent.setOptions({ tabBarStyle: undefined });
  }, [navigation, activeGroupId]); // ADDED

  // NEW: share current location to the active group as a Google Maps link
  const shareGroupLocation = useCallback(async () => {
    if (!activeGroupId || groupLocSending) return;
    setGroupLocSending(true);
    try {
      let coords = null;

      // Try expo-location if available
      try {
        const Location = await import("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
        }
      } catch {
        // Fallback to navigator.geolocation
      }

      if (!coords && global?.navigator?.geolocation) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              coords = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              };
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
          );
        });
      }

      if (!coords) {
        Alert.alert(
          "Location",
          "Unable to get your location. Please enable location permissions."
        );
        return;
      }

      const url = `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
      const content = `📍 My location: ${url}`;
      const { data } = await API.post(
        `/groups/${encodeURIComponent(activeGroupId)}/messages`,
        { content },
        { headers: authHdr }
      );
      if (data && data.id) setGroupMsgs((p) => [...p, data]);
      setGroupShareVisible(false);
    } catch (e) {
      Alert.alert(
        "Error",
        e?.response?.data?.error || e?.message || "Share failed"
      );
    } finally {
      setGroupLocSending(false);
    }
  }, [activeGroupId, authHdr, groupLocSending]); // NEW

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Top bar */}
      <View style={styles.topBar}>
        {/* Back button when inside a group chat */}
        {!!activeGroupId && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setActiveGroupId(null)}
          >
            <Icon name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {/* Group avatar tap -> settings */}
        {!!activeGroupId && (
          <TouchableOpacity
            style={[styles.avatar, { marginRight: 8 }]}
            onPress={showGroupInfo}
          >
            <Text style={styles.avatarTxt}>
              {activeGroupName.slice(0, 2).toUpperCase()}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>
          {activeGroupId ? activeGroupName || "Group Chat" : "Groups"}
        </Text>
        <View style={{ flex: 1 }} />
        {!activeGroupId ? (
          <>
            <TouchableOpacity style={styles.iconBtn} onPress={loadGroups}>
              <Icon name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setCreateVisible(true)}
            >
              <Icon name="group-add" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setBroadcastVisible(true)}
            >
              <Icon name="campaign" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.iconBtn} onPress={showGroupInfo}>
            <Icon name="edit" size={20} color="#fff" />{" "}
            {/* CHANGED from info to edit */}
          </TouchableOpacity>
        )}
      </View>

      {/* Main body: list or chat */}
      {!activeGroupId ? (
        groupsLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={C.accent} />
        ) : groups.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>No groups yet</Text>
            <Text style={styles.placeholderSub}>
              Tap + to create your first group
            </Text>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => String(g.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => openGroup(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>
                    {(item.name || "G").slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.email} numberOfLines={1}>
                    {item.name || `Group #${item.id}`}
                  </Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    Owner: {item.owner_email}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color={C.sub} />
              </TouchableOpacity>
            )}
          />
        )
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ChatWindow
            activeContact={`group:${activeGroupId}`}
            messages={groupMsgs}
            currentUserEmail={userEmail}
            onRefresh={() => {}}
            onClear={() => {}}
            bottomInset={
              groupEmojiVisible && !kbVisible ? 320 : kbVisible ? 0 : 70
            }
          />

          {/* Group composer: same UX as direct chat */}
          <View style={styles.messageBox}>
            <TouchableOpacity
              style={styles.aiBtn}
              onPress={() => setGroupEmojiVisible(true)}
            >
              <Icon name="emoji-emotions" size={22} color="#9ab1c1" />
            </TouchableOpacity>

            <TextInput
              style={styles.messageInput}
              multiline
              placeholder={`Message ${activeGroupName}`}
              placeholderTextColor="#5f6d7c"
              value={groupText}
              onChangeText={setGroupText}
              selectionColor="#3a7afe"
              textAlignVertical="center" // NEW
            />

            <TouchableOpacity
              style={[
                styles.aiBtn,
                (!groupText.trim() || groupEnhancing) && { opacity: 0.45 },
              ]}
              disabled={!groupText.trim() || groupEnhancing}
              onPress={enhanceGroupText}
            >
              {groupEnhancing ? (
                <ActivityIndicator color="#9ab1c1" size="small" />
              ) : (
                <Icon name="auto-awesome" size={22} color="#9ab1c1" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.aiBtn}
              onPress={() => setGroupShareVisible(true)}
            >
              <Icon name="attach-file" size={22} color="#9ab1c1" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!groupText.trim() || groupSending) && { opacity: 0.45 },
              ]}
              disabled={!groupText.trim() || groupSending}
              onPress={sendGroupMessage}
            >
              {groupSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Icon name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          {/* Emoji Sheet */}
          <Modal
            transparent
            visible={groupEmojiVisible}
            animationType="fade"
            onRequestClose={() => setGroupEmojiVisible(false)}
          >
            <Pressable
              style={styles.backdrop}
              onPress={() => setGroupEmojiVisible(false)}
            >
              <View />
            </Pressable>
            <View style={styles.emojiSheet}>
              <View style={styles.emojiHeader}>
                <Text style={styles.infoTitle}>Emojis</Text>
                <TouchableOpacity onPress={() => setGroupEmojiVisible(false)}>
                  <Icon name="close" size={20} color="#e9edef" />
                </TouchableOpacity>
              </View>
              <View style={styles.emojiGrid}>
                {groupEmojis.map((em) => (
                  <TouchableOpacity
                    key={em}
                    style={styles.emojiCell}
                    onPress={() => insertGroupEmoji(em)}
                  >
                    <Text style={{ fontSize: 24 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Modal>

          {/* Share Sheet */}
          <Modal
            transparent
            visible={groupShareVisible}
            animationType="fade"
            onRequestClose={() => setGroupShareVisible(false)}
          >
            <Pressable
              style={styles.backdrop}
              onPress={() => setGroupShareVisible(false)}
            >
              <View />
            </Pressable>
            <View style={styles.shareSheet}>
              <Text style={styles.infoTitle}>Share</Text>
              <View style={styles.shareRow}>
                <TouchableOpacity
                  style={styles.shareItem}
                  onPress={() =>
                    Alert.alert("Info", "Media picker not implemented")
                  }
                >
                  <View
                    style={[styles.shareIcon, { backgroundColor: "#5c6ef8" }]}
                  >
                    <Icon name="image" size={20} color="#fff" />
                  </View>
                  <Text style={styles.preview}>Media</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareItem}
                  onPress={() =>
                    Alert.alert("Info", "Documents picker not implemented")
                  }
                >
                  <View
                    style={[styles.shareIcon, { backgroundColor: "#8e61d6" }]}
                  >
                    <Icon name="description" size={20} color="#fff" />
                  </View>
                  <Text style={styles.preview}>Documents</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareItem}
                  onPress={shareGroupLocation} // CHANGED
                >
                  <View
                    style={[styles.shareIcon, { backgroundColor: "#17a884" }]}
                  >
                    <Icon name="place" size={20} color="#fff" />
                  </View>
                  <Text style={styles.preview}>
                    {groupLocSending ? "Sharing..." : "Location"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shareItem, { backgroundColor: "#444f5d" }]}
                  onPress={() => setGroupShareVisible(false)}
                >
                  <View
                    style={[styles.shareIcon, { backgroundColor: "#444f5d" }]}
                  >
                    <Icon name="close" size={20} color="#fff" />
                  </View>
                  <Text style={styles.preview}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      )}

      {/* Create Group Modal */}
      <Modal
        transparent
        visible={createVisible}
        animationType="fade"
        onRequestClose={() => !cgSubmitting && setCreateVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => !cgSubmitting && setCreateVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.broadcastCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.infoTitle}>Create Group</Text>
            <TouchableOpacity
              onPress={() => setCreateVisible(false)}
              style={{ padding: 4 }}
            >
              <Icon name="close" size={20} color="#e9edef" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.searchInput,
              { color: C.text, marginHorizontal: 14 },
            ]}
            placeholder="Group name"
            placeholderTextColor="#6d7d92"
            value={cgName}
            onChangeText={setCgName}
            selectionColor="#3a7afe"
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: C.text, marginHorizontal: 14, marginTop: 8 },
            ]}
            placeholder="Members (comma or space separated emails, optional)"
            placeholderTextColor="#6d7d92"
            value={cgMembers}
            onChangeText={setCgMembers}
            selectionColor="#3a7afe"
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { alignSelf: "flex-end", marginTop: 10, marginRight: 14 },
              cgSubmitting && { opacity: 0.6 },
            ]}
            disabled={cgSubmitting}
            onPress={createGroup}
          >
            {cgSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="check" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Group Info Modal */}
      <Modal
        transparent
        visible={groupInfoVisible}
        animationType="fade"
        onRequestClose={() => setGroupInfoVisible(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setGroupInfoVisible(false)}
        >
          <View />
        </Pressable>
        <View style={styles.infoCard /* CHANGED sizing below in styles */}>
          {/* Header with title + close */}
          <View style={styles.infoHeaderRow}>
            <Text style={styles.infoTitle}>
              {groupInfo?.group?.name || activeGroupName || "Group Settings"}
            </Text>
            <TouchableOpacity
              onPress={() => setGroupInfoVisible(false)}
              style={{ padding: 6 }}
            >
              <Icon name="close" size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {groupInfoLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 10 }} />
          ) : groupInfo ? (
            <>
              <Text style={styles.infoBody}>
                Owner: {groupInfo.group?.owner_email}
              </Text>

              {/* Non-admin hint */}
              {!isAdmin && (
                <Text style={[styles.infoBody, { color: "#ffb74d" }]}>
                  Only admins can edit group settings
                </Text>
              )}

              {/* Rename section (admins) */}
              {isAdmin && (
                <>
                  <Text style={[styles.sectionTitle]}>Rename group</Text>
                  <View
                    style={[
                      styles.searchBar,
                      { marginTop: 6, marginBottom: 10 },
                    ]}
                  >
                    <TextInput
                      style={[styles.searchInput, { color: C.text }]}
                      placeholder="New name"
                      placeholderTextColor="#6d7d92"
                      value={renameValue}
                      onChangeText={setRenameValue}
                      selectionColor="#3a7afe"
                    />
                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 10,
                        height: 40,
                        justifyContent: "center",
                      }}
                      onPress={renameGroup}
                    >
                      <Icon name="save" size={18} color={C.accent} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Add member (admins) */}
              {isAdmin && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 10 }]}>
                    Add member
                  </Text>
                  <View
                    style={[
                      styles.searchBar,
                      { marginTop: 6, marginBottom: 10 },
                    ]}
                  >
                    <TextInput
                      style={[styles.searchInput, { color: C.text }]}
                      placeholder="email@example.com"
                      placeholderTextColor="#6d7d92"
                      value={addMemberEmail}
                      onChangeText={setAddMemberEmail}
                      selectionColor="#3a7afe"
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 10,
                        height: 40,
                        justifyContent: "center",
                      }}
                      onPress={addMember}
                    >
                      <Icon name="person-add" size={18} color={C.accent} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Members list (scrollable area) */}
              <Text style={[styles.sectionTitle, { marginTop: 12 }]}>
                Members
              </Text>
              <View style={{ maxHeight: 360, marginTop: 6 }}>
                <FlatList
                  data={groupInfo.members || []}
                  keyExtractor={(m) => m.member_email}
                  renderItem={({ item }) => {
                    const isItemAdmin =
                      !!item.is_admin ||
                      item.member_email === groupInfo.group?.owner_email;
                    return (
                      <View
                        style={[
                          styles.contactRow,
                          {
                            backgroundColor: "transparent",
                            paddingVertical: 10,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.avatar,
                            { backgroundColor: "#2a3c52", marginRight: 12 },
                          ]}
                        >
                          <Text style={styles.avatarTxt}>
                            {item.member_email.slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.email}>{item.member_email}</Text>
                          <Text style={styles.preview}>
                            {isItemAdmin ? "Admin" : "Member"}
                          </Text>
                        </View>
                        {isAdmin && item.member_email !== userEmail && (
                          <>
                            <TouchableOpacity
                              onPress={() =>
                                toggleAdmin(item.member_email, !isItemAdmin)
                              }
                              style={{ marginRight: 10 }}
                            >
                              <Icon
                                name="admin-panel-settings"
                                size={18}
                                color={isItemAdmin ? "#ffb74d" : "#66d38a"}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeMember(item.member_email)}
                            >
                              <Icon
                                name="person-remove"
                                size={18}
                                color="#ff6b6b"
                              />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ padding: 8 }}>
                      <Text style={{ color: C.sub, fontSize: 12 }}>
                        No members
                      </Text>
                    </View>
                  }
                />
              </View>

              {/* Actions */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  marginTop: 12,
                }}
              >
                <TouchableOpacity
                  onPress={leaveGroup}
                  style={[styles.iconBtn, { marginRight: 6 }]}
                >
                  <Icon name="logout" size={20} color="#ffb74d" />
                </TouchableOpacity>
                {isOwner && (
                  <TouchableOpacity
                    onPress={deleteGroup}
                    style={styles.iconBtn}
                  >
                    <Icon name="delete-forever" size={20} color="#ff6b6b" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.infoBody}>No group info.</Text>
          )}
        </View>
      </Modal>

      {/* Broadcast Modal (unchanged UI, but fetch-on-open now) */}
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
            {/* NEW: Enhance button (bw icon) */}
            <TouchableOpacity
              style={[
                styles.aiBtn,
                (!content.trim() || enhancing) && { opacity: 0.45 },
              ]}
              disabled={!content.trim() || enhancing}
              onPress={enhanceBroadcast}
            >
              {enhancing ? (
                <ActivityIndicator color="#9ab1c1" size="small" />
              ) : (
                <Icon name="auto-awesome" size={20} color="#9ab1c1" />
              )}
            </TouchableOpacity>
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
    alignItems: "center", // CHANGED: center items like direct chat
    backgroundColor: "#182a3b",
    borderRadius: 20,
    paddingHorizontal: 8, // tighter
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#223b53",
  },
  messageInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    maxHeight: 110,
    minHeight: 40, // NEW
    paddingVertical: 8, // NEW
    textAlignVertical: "center", // NEW (android)
  },
  aiBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
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
    // CHANGED: make the settings card broader and taller
    position: "absolute",
    left: 16,
    right: 16,
    top: "8%",
    bottom: "6%",
    backgroundColor: C.card,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#24425f",
  },
  infoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  infoTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  infoBody: { color: C.sub, fontSize: 13, lineHeight: 18, marginTop: 8 },
  sectionTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6,
  },
  successNote: {
    color: "#4cc790",
    fontSize: 11,
    marginTop: 4,
    marginLeft: 6,
    marginBottom: 2,
  },
  // Emoji/Share sheets (reuse palette)
  emojiSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#142332",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#21384c",
  },
  emojiHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
  emojiCell: {
    width: "12.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  shareSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#142332",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#21384c",
  },
  shareRow: { flexDirection: "row", flexWrap: "wrap" },
  shareItem: { width: "25%", alignItems: "center", marginVertical: 10 },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
});
