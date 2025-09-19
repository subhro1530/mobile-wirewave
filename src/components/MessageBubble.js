// components/MessageBubble.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function MessageBubble({ message, currentUser }) {
  const isMine = message.sender_email === currentUser.email;
  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
      >
        <Text style={styles.text}>{message.content}</Text>
        <Text style={styles.time}>
          {new Date(message.sent_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 6 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: "#3a7afe",
    borderTopRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#2a2a2a",
    borderTopLeftRadius: 4,
  },
  text: { color: "#fff", fontSize: 14, lineHeight: 18 },
  time: {
    fontSize: 10,
    color: "#cfd8ff",
    textAlign: "right",
    marginTop: 4,
    opacity: 0.75,
  },
});
