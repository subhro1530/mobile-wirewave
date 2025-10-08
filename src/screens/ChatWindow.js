import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { AuthContext } from "../AuthContext";
import API from "../api";
import Icon from "react-native-vector-icons/MaterialIcons";
import ChatWindow from "../components/ChatWindow";

const COLORS = {
  bar: "#008069",
  bg: "#0b141a",
  bgInput: "#1f2c34",
  accent: "#25D366",
  textPrimary: "#e9edef",
  textSecondary: "#8696a0",
  bubbleMine: "#005c4b",
};

export default function ChatWindowScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userEmail } = useContext(AuthContext);
  const contact = route.params?.contact;

  const [allMessages, setAllMessages] = useState([]);
  const [loadingSend, setLoadingSend] = useState(false);
  const [text, setText] = useState("");
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const chatRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await API.get("/messages");
      setAllMessages(res.data || []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const conversation = allMessages.filter(
    (m) =>
      (m.sender_email === userEmail && m.receiver_email === contact) ||
      (m.receiver_email === userEmail && m.sender_email === contact)
  );

  // Mark read
  useEffect(() => {
    const unread = conversation.filter(
      (m) => m.receiver_email === userEmail && !m.read
    );
    if (!unread.length) return;
    (async () => {
      for (const m of unread) {
        try {
          await API.post("/messages/read", { message_id: m.id });
        } catch {}
      }
      setAllMessages((prev) =>
        prev.map((p) =>
          unread.find((u) => u.id === p.id) ? { ...p, read: true } : p
        )
      );
    })();
  }, [conversation, userEmail]);

  const sendMessage = useCallback(async () => {
    if (!text.trim() || !contact) return;
    setLoadingSend(true);
    try {
      await API.post("/messages", {
        receiver_email: contact,
        content: text.trim(),
      });
      setText("");
      await loadMessages();
      setTimeout(() => chatRef.current?.scrollToBottom?.(), 60);
    } finally {
      setLoadingSend(false);
    }
  }, [text, contact, loadMessages]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardOffset(e.endCoordinates.height);
      setTimeout(() => chatRef.current?.scrollToBottom?.(), 80);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarTxt}>
            {contact?.slice(0, 2)?.toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.contactName} numberOfLines={1}>
            {contact}
          </Text>
          <Text style={styles.contactSub} numberOfLines={1}>
            online
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Icon name="videocam" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}>
          <Icon name="call" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}>
          <Icon name="more-vert" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ChatWindow
          ref={chatRef}
          activeContact={contact}
          messages={conversation}
          currentUserEmail={userEmail}
          onRefresh={loadMessages}
          onClear={() => {}}
          bottomInset={70}
        />

        {/* Composer */}
        <View
          style={[
            styles.composerWrap,
            { marginBottom: Platform.OS === "android" ? keyboardOffset : 0 },
          ]}
        >
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.plusBtn}>
              <Icon name="emoji-emotions" size={22} color="#8696a0" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message"
              placeholderTextColor={COLORS.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
            />
            <TouchableOpacity style={styles.attachBtn}>
              <Icon name="attach-file" size={22} color="#8696a0" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn}>
              <Icon name="camera-alt" size={22} color="#8696a0" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.sendBtn}
            disabled={!text.trim() || loadingSend}
            onPress={sendMessage}
          >
            {loadingSend ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Icon name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingTop: (StatusBar.currentHeight || 0) + 6,
    paddingBottom: 8,
    paddingHorizontal: 4,
    backgroundColor: COLORS.bar,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1f2c34",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerAvatarTxt: { color: COLORS.textPrimary, fontWeight: "600" },
  contactName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  contactSub: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  composerWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "#0b141a",
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.bgInput,
    borderRadius: 26,
    paddingHorizontal: 4,
    paddingVertical: 4,
    alignItems: "flex-end",
  },
  plusBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingHorizontal: 4,
    paddingVertical: 6,
    maxHeight: 120,
  },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
