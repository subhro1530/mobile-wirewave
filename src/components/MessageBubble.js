// components/MessageBubble.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

export default function MessageBubble({
  message,
  currentUser,
  isSelected = false,
  selectionMode = false,
}) {
  const isMine = message.sender_email === currentUser.email;
  const read = !!message.read;
  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
          isSelected && styles.bubbleSelected,
        ]}
      >
        <Text style={styles.text}>{message.content}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.time}>
            {new Date(message.sent_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isMine && (
            <Icon
              name={read ? "done-all" : "check"}
              size={14}
              color={read ? "#cfe2ff" : "#cfd8ff"}
              style={{ marginLeft: 4, opacity: 0.85 }}
            />
          )}
        </View>
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
  bubbleSelected: {
    borderWidth: 1,
    borderColor: "#3a7afe",
  },
  text: { color: "#fff", fontSize: 14, lineHeight: 18 },
  time: {
    fontSize: 10,
    color: "#cfd8ff",
    textAlign: "right",
    marginTop: 4,
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
  },
});
