// components/ChatWindow.js
import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Linking,
} from "react-native";
import MessageBubble from "./MessageBubble";

const THEME = {
  bg: "#0b141a",
  dateBg: "#16273a",
  dateText: "#7e93ad",
};

// Helper: stable color per email
function colorForEmail(email) {
  let h = 0;
  for (let i = 0; i < (email || "").length; i++)
    h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 55%, 70%)`;
}

function groupByDate(list) {
  const map = {};
  list.forEach((m) => {
    const d = new Date(m.sent_at);
    const key = d.toDateString();
    if (!map[key]) map[key] = [];
    map[key].push(m);
  });
  return Object.entries(map).map(([date, items]) => ({
    date,
    items: items.sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    ),
  }));
}

export default forwardRef(function ChatWindow(
  {
    activeContact,
    messages,
    currentUserEmail,
    onRefresh,
    onClear,
    bottomInset = 0,
    selectionMode = false,
    selectedIds = new Set(),
    onToggleSelectMessage,
    onStartSelection,
    onLongPressMessage, // NEW
    refreshing = false, // NEW
  },
  ref
) {
  const flatRef = useRef(null);
  const grouped = groupByDate(messages || []);
  const userAtBottomRef = useRef(true);
  const prevLenRef = useRef(messages?.length || 0);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      try {
        flatRef.current?.scrollToEnd?.({ animated });
      } catch {}
    });
  }, []);

  const scrollToTop = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      try {
        flatRef.current?.scrollToOffset?.({ offset: 0, animated });
      } catch {}
    });
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToBottom,
    scrollToTop,
  }));

  // When switching contact, force bottom
  useEffect(() => {
    if (activeContact) {
      scrollToBottom(false);
      prevLenRef.current = messages?.length || 0;
    }
  }, [activeContact, scrollToBottom, messages?.length]);

  // Only auto scroll on new messages if user is at (or near) bottom
  useEffect(() => {
    const len = messages?.length || 0;
    if (len > prevLenRef.current && userAtBottomRef.current) {
      scrollToBottom();
    }
    prevLenRef.current = len;
  }, [messages, scrollToBottom]);

  if (!activeContact) {
    return (
      <View style={styles.placeholder}>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.placeholderLogo}
          resizeMode="contain"
        />
        <Text style={styles.placeholderSub}>
          Select or start a conversation
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: THEME.bg }]}>
      <FlatList
        ref={flatRef}
        data={grouped}
        keyExtractor={(g) => g.date}
        renderItem={({ item }) => (
          <View>
            <View style={[styles.dateWrap, { backgroundColor: THEME.dateBg }]}>
              <Text style={[styles.dateTxt, { color: THEME.dateText }]}>
                {item.date}
              </Text>
            </View>
            {item.items.map((m) => {
              const isSelected = selectedIds.has(m.id);
              const isGroup =
                typeof activeContact === "string" &&
                activeContact.startsWith("group:");
              const isMe = m.sender_email === currentUserEmail;
              const onPressSmart = () => {
                if (selectionMode) {
                  onToggleSelectMessage?.(m.id);
                  return;
                }
                const t = (m.content || "").toString();
                const urlRe = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
                const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
                const phoneRe = /(\+?\d[\d\s\-().]{6,}\d)/;
                let target = null;
                const urlMatch = t.match(urlRe);
                const emailMatch = t.match(emailRe);
                const phoneMatch = t.match(phoneRe);
                if (urlMatch) {
                  const raw = urlMatch[0];
                  target = raw.startsWith("http") ? raw : `https://${raw}`;
                } else if (emailMatch) {
                  target = `mailto:${emailMatch[0]}`;
                } else if (phoneMatch) {
                  const num = phoneMatch[0].replace(/[^\d+]/g, "");
                  target = `tel:${num}`;
                }
                if (target) Linking.openURL(target).catch(() => {});
              };

              return (
                <TouchableOpacity
                  key={m.id}
                  activeOpacity={selectionMode ? 0.8 : 1}
                  onLongPress={() => {
                    if (selectionMode) onToggleSelectMessage?.(m.id);
                    else if (onLongPressMessage) onLongPressMessage(m);
                    else onStartSelection?.(m.id);
                  }}
                  delayLongPress={280}
                  onPress={onPressSmart} // CHANGED
                >
                  {/* Sender label for group chats (WhatsApp-like) */}
                  {isGroup && !isMe && (
                    <Text
                      style={[
                        styles.senderLabel,
                        { color: colorForEmail(m.sender_email) },
                      ]}
                    >
                      {m.sender_userid || m.sender_email}
                    </Text>
                  )}
                  <MessageBubble
                    message={m}
                    currentUser={{ email: currentUserEmail }}
                    isSelected={isSelected}
                    selectionMode={selectionMode}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        keyboardShouldPersistTaps="handled"
        onRefresh={onRefresh}
        refreshing={refreshing} // CHANGED: was false
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            e.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          userAtBottomRef.current = distanceFromBottom < 60; // threshold
        }}
        onContentSizeChange={() => {
          // If content size changes (e.g., first load) and userAtBottom, ensure bottom
          if (userAtBottomRef.current) scrollToBottom(false);
        }}
        scrollEventThrottle={16}
      />
      {messages.length === 0 && (
        <View style={styles.emptyThread}>
          <Text style={{ color: "#666", fontSize: 12 }}>
            No messages yet. Say hi!
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, paddingBottom: 50, backgroundColor: "transparent" },
  dateWrap: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    marginVertical: 12,
  },
  dateTxt: { fontSize: 11 },
  senderLabel: {
    alignSelf: "flex-start",
    marginLeft: 6,
    marginBottom: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#121212",
  },
  placeholderLogo: { width: 160, height: 160, marginBottom: 12 },
  placeholderSub: { color: "#777", marginTop: 6 },
  emptyThread: { position: "absolute", top: 20, alignSelf: "center" },
});
