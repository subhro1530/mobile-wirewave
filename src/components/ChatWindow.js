// components/ChatWindow.js
import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { View, FlatList, Text, StyleSheet, Image } from "react-native";
import MessageBubble from "./MessageBubble";

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
    <View style={styles.container}>
      <FlatList
        ref={flatRef}
        data={grouped}
        keyExtractor={(g) => g.date}
        renderItem={({ item }) => (
          <View>
            <View style={styles.dateWrap}>
              <Text style={styles.dateTxt}>{item.date}</Text>
            </View>
            {item.items.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                currentUser={{ email: currentUserEmail }}
              />
            ))}
          </View>
        )}
        keyboardShouldPersistTaps="handled"
        onRefresh={onRefresh}
        refreshing={false}
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
  container: { flex: 1, backgroundColor: "#121212" },
  list: { padding: 14, paddingBottom: 40 },
  dateWrap: {
    alignSelf: "center",
    backgroundColor: "#1f1f1f",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    marginVertical: 12,
  },
  dateTxt: { color: "#bbb", fontSize: 11 },
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
