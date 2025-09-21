// components/ChatWindow.js
import React, { useEffect, useRef } from "react";
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

export default function ChatWindow({
  activeContact,
  messages,
  currentUserEmail,
  onRefresh,
  onClear,
}) {
  const flatRef = useRef(null);
  const grouped = groupByDate(messages || []);

  useEffect(() => {
    if (flatRef.current) {
      setTimeout(() => flatRef.current.scrollToEnd({ animated: true }), 60);
    }
  }, [messages, activeContact]);

  if (!activeContact) {
    return (
      <View style={styles.placeholder}>
        <Image
          source={require("../../assets/logo.png")}
          /* logo image */
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
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={false}
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
}

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
  placeholderLogo: {
    width: 160,
    height: 160,
    marginBottom: 12,
  },
  placeholderSub: { color: "#777", marginTop: 6 },
  emptyThread: { position: "absolute", top: 20, alignSelf: "center" },
});
