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
  KeyboardAvoidingView,
  Keyboard,
  Platform, // ADDED
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import API from "../api";
import { AuthContext } from "../AuthContext";
import ChatWindow from "../components/ChatWindow";

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

  // === GROUPS API ===
  const loadGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const { data } = await API.get("/groups", { headers: authHdr });
      setGroups(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setGroupsLoading(false);
    }
  }, [authHdr]);

  useEffect(() => {
    loadGroups();
    const t = setInterval(loadGroups, 10000);
    return () => clearInterval(t);
  }, [loadGroups]);

  const openGroup = useCallback((g) => {
    setActiveGroupId(g.id);
    setActiveGroupName(g.name || `Group #${g.id}`);
    setGroupMsgs([]);
    setGroupText("");
  }, []);

  // Group messages poller (only when a group is active)
  useEffect(() => {
    if (!activeGroupId) return;
    let cancel = false;
    const fetchMsgs = async () => {
      try {
        const { data } = await API.get(
          `/groups/${encodeURIComponent(
            activeGroupId
          )}/messages?limit=200&offset=0`,
          { headers: authHdr }
        );
        if (!cancel) setGroupMsgs(Array.isArray(data) ? data : []);
      } catch {}
    };
    fetchMsgs();
    const t = setInterval(fetchMsgs, 4000);
    return () => {
      cancel = true;
      clearInterval(t);
    };
  }, [activeGroupId, authHdr]);

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
      } catch (e) {
        Alert.alert(
          "Error",
          e?.response?.data?.error || e.message || "Remove failed"
        );
      }
    },
    [activeGroupId, authHdr, loadGroupInfo]
  );

  const leaveGroup = useCallback(async () => {
    if (!activeGroupId) return;
    try {
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
  }, [activeGroupId, authHdr, loadGroups]);

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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.title}>
          {activeGroupId ? "Group Chat" : "Groups"}
        </Text>
        <View style={{ flex: 1 }} />
        {!activeGroupId && (
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
        )}
        {!!activeGroupId && (
          <TouchableOpacity style={styles.iconBtn} onPress={showGroupInfo}>
            <Icon name="info" size={20} color="#fff" />
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
            bottomInset={kbVisible ? 0 : 70}
          />
          {/* Group composer with AI enhance */}
          <View style={styles.messageBox}>
            <TextInput
              style={styles.messageInput}
              multiline
              placeholder={`Message ${activeGroupName}`}
              placeholderTextColor="#5f6d7c"
              value={groupText}
              onChangeText={setGroupText}
              selectionColor="#3a7afe"
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
                <Icon name="auto-awesome" size={20} color="#9ab1c1" />
              )}
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
        <View style={styles.infoCard}>
          {groupInfoLoading ? (
            <ActivityIndicator color={C.accent} />
          ) : groupInfo ? (
            <>
              <Text style={styles.infoTitle}>
                {groupInfo.group?.name || activeGroupName}
              </Text>
              <Text style={styles.infoBody}>
                Owner: {groupInfo.group?.owner_email}
              </Text>
              {isAdmin && (
                <>
                  <Text style={[styles.infoBody, { marginTop: 10 }]}>
                    Rename group
                  </Text>
                  <TextInput
                    style={[
                      styles.searchInput,
                      { color: C.text, marginTop: 6 },
                    ]}
                    placeholder="New name"
                    placeholderTextColor="#6d7d92"
                    value={renameValue}
                    onChangeText={setRenameValue}
                    selectionColor="#3a7afe"
                  />
                  <TouchableOpacity
                    style={[
                      styles.sendBtn,
                      { alignSelf: "flex-start", marginTop: 6 },
                    ]}
                    onPress={renameGroup}
                  >
                    <Icon name="save" size={18} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
              <Text style={[styles.infoBody, { marginTop: 12 }]}>Members</Text>
              <FlatList
                data={groupInfo.members || []}
                keyExtractor={(m) => m.member_email}
                style={{ maxHeight: 220, marginTop: 6 }}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.contactRow,
                      { backgroundColor: "transparent" },
                    ]}
                  >
                    <View
                      style={[styles.avatar, { backgroundColor: "#2a3c52" }]}
                    >
                      <Text style={styles.avatarTxt}>
                        {item.member_email.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.email}>{item.member_email}</Text>
                      <Text style={styles.preview}>
                        {item.is_admin ? "Admin" : "Member"}
                      </Text>
                    </View>
                    {isAdmin && item.member_email !== userEmail && (
                      <TouchableOpacity
                        onPress={() => removeMember(item.member_email)}
                      >
                        <Icon name="person-remove" size={18} color="#ff6b6b" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 8 }}>
                    <Text style={{ color: C.sub, fontSize: 12 }}>
                      No members
                    </Text>
                  </View>
                }
              />
              {isAdmin && (
                <>
                  <Text style={[styles.infoBody, { marginTop: 10 }]}>
                    Add member
                  </Text>
                  <View style={[styles.searchBar, { marginTop: 6 }]}>
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
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  marginTop: 10,
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
