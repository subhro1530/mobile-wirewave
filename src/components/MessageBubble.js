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
  clickable: "#66d38a", // NEW: light green for clickable parts
};

// NEW: render message content with highlighted clickable parts
function renderHighlightedText(text) {
  const src = String(text || "");
  if (!src) return src;

  const patterns = [
    { type: "url", re: /(https?:\/\/[^\s]+|www\.[^\s]+)/gi },
    { type: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "phone", re: /(\+?\d[\d\s\-().]{6,}\d)/g },
  ];

  // collect matches with start/end to avoid overlaps
  const all = [];
  patterns.forEach(({ type, re }) => {
    let m;
    while ((m = re.exec(src)) !== null) {
      all.push({ start: m.index, end: m.index + m[0].length, type });
    }
  });
  all.sort((a, b) => a.start - b.start);

  // filter overlaps (keep earliest)
  const kept = [];
  let lastEnd = -1;
  for (const seg of all) {
    if (seg.start >= lastEnd) {
      kept.push(seg);
      lastEnd = seg.end;
    }
  }

  // build parts
  const parts = [];
  let idx = 0;
  kept.forEach((seg, i) => {
    if (seg.start > idx) {
      parts.push(
        <Text key={`t_${i}_n`} style={styles.text}>
          {src.slice(idx, seg.start)}
        </Text>
      );
    }
    parts.push(
      <Text key={`t_${i}_c`} style={[styles.text, styles.clickable]}>
        {src.slice(seg.start, seg.end)}
      </Text>
    );
    idx = seg.end;
  });
  if (idx < src.length) {
    parts.push(
      <Text key={`t_tail`} style={styles.text}>
        {src.slice(idx)}
      </Text>
    );
  }
  return parts;
}

export default function MessageBubble({
  message,
  currentUser,
  isSelected = false,
  selectionMode = false,
}) {
  const isMine = message.sender_email === currentUser.email;
  const read = !!message.read;
  const isBroadcast =
    typeof message.content === "string" &&
    (message.content.startsWith("📢") || message.content.startsWith("🎤"));
  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.wrap,
          isMine && styles.wrapMine,
          !isMine && styles.wrapOther,
          isBroadcast && styles.broadcastWrap,
          isSelected && styles.wrapSelected,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleOther,
            isBroadcast &&
              (isMine ? styles.broadcastMine : styles.broadcastOther),
          ]}
        >
          {isBroadcast && <Text style={styles.broadcastTag}>BROADCAST</Text>}
          {/* CHANGED: highlighted content */}
          <Text style={styles.text}>
            {renderHighlightedText(message.content)}
          </Text>
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
  // NEW: clickable token style
  clickable: { color: COLORS.clickable, fontWeight: "600" },
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
  broadcastWrap: {
    shadowColor: "#3a7afe",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  broadcastMine: {
    borderWidth: 1,
    borderColor: "#8fb8ff",
  },
  broadcastOther: {
    borderWidth: 1,
    borderColor: "#3a7afe",
  },
  broadcastTag: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#b9d4ff",
    marginBottom: 4,
  },
});
