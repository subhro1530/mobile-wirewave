// components/MessageBubble.js
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

const COLORS = {
  mine: "#1b4fbf", // refined icon blue dark
  other: "#1e2735",
  text: "#e9edef",
  time: "#93a4c2",
  readTick: "#6ad1ff",
  sentTick: "#5f7594",
  selectedBorder: "#3a7afe",
};

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
          styles.wrap,
          isMine && styles.wrapMine,
          !isMine && styles.wrapOther,
          isSelected && styles.wrapSelected,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleOther,
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
                color={read ? COLORS.readTick : COLORS.sentTick}
                style={{ marginLeft: 4, opacity: 0.85 }}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginBottom: 6, paddingHorizontal: 4 },
  rowLeft: { justifyContent: "flex-start" },
  rowRight: { justifyContent: "flex-end" },
  wrap: { position: "relative", maxWidth: "90%" }, // widened
  wrapMine: { alignSelf: "flex-end" },
  wrapOther: { alignSelf: "flex-start" },
  wrapSelected: {
    shadowColor: "#3a7afe",
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  bubble: {
    // remove internal maxWidth constraint
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  bubbleMine: { backgroundColor: COLORS.mine, borderTopRightRadius: 8 }, // soften
  bubbleOther: { backgroundColor: COLORS.other, borderTopLeftRadius: 8 },
  text: { color: COLORS.text, fontSize: 14, lineHeight: 18 },
  time: {
    fontSize: 10,
    color: COLORS.time,
    textAlign: "right",
    marginTop: 4,
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 2,
  },
  tailOther: {
    left: -4,
    backgroundColor: COLORS.other,
    borderBottomRightRadius: 2,
  },
  text: { color: COLORS.text, fontSize: 14, lineHeight: 18 },
  time: {
    fontSize: 10,
    color: COLORS.time,
    textAlign: "right",
    marginTop: 4,
    opacity: 0.75,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 2,
  },
});
