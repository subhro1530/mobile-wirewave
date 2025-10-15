import React, { useContext, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import { AuthContext } from "../AuthContext";
import API from "../api";

const CLICK = "#3a7afe";

export default function AgentScreen() {
  const navigation = useNavigation();
  const { userToken } = useContext(AuthContext);
  const authHdr = useMemo(
    () => (userToken ? { Authorization: `Bearer ${userToken}` } : undefined),
    [userToken]
  );
  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";

  const [items, setItems] = useState([
    {
      id: "hello",
      role: "agent",
      text: "I’m the Agent. Tell me: “send a message to user@example.com named Hello there!”. I’ll confirm before sending. If anything’s missing, I’ll ask for it.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const pendingRef = useRef(null); // { email, message }

  const append = (role, text, extra = {}) =>
    setItems((p) => [
      ...p,
      { id: String(Date.now()) + Math.random(), role, text, ...extra },
    ]);

  async function parseWithGemini(text) {
    // Fallback regex if no key
    const quick = parseWithRegex(text);
    if (!geminiKey) return quick;

    try {
      const resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          encodeURIComponent(geminiKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      "Extract structured JSON from this instruction. Return ONLY JSON without any prose. " +
                      'Schema: {"intent":"send","email":"<string or empty>","message":"<string or empty>","confirm":false}. ' +
                      "If user clearly confirms sending in the sentence (e.g., 'send now'/'yes send'), set confirm true. " +
                      "Instruction: " +
                      text,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      const data = await resp.json();
      const raw =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.candidates?.[0]?.content?.parts?.[0]?.raw_text ??
        "";
      const jsonStr = String(raw)
        .replace(/```json|```/g, "")
        .trim();
      const parsed = JSON.parse(jsonStr);

      // Normalize and backfill using regex if needed
      const fromModel = {
        email: String(parsed?.email || "").trim(),
        message: String(parsed?.message || "").trim(),
        confirm: !!parsed?.confirm,
      };
      const fromRegex = parseWithRegex(text);

      const emailClean = (fromModel.email || fromRegex.email || "")
        .replace(/^[<("'\[\s]+/, "")
        .replace(/[>)"'\]\s.,;:]+$/, "");

      const messageClean = (
        fromModel.message ||
        fromRegex.message ||
        ""
      ).trim();

      return {
        email: emailClean,
        message: messageClean,
        confirm: fromModel.confirm || fromRegex.confirm,
      };
    } catch {
      return parseWithRegex(text);
    }
  }

  function parseWithRegex(text) {
    const src = String(text || "");

    // Email: first email-like token anywhere
    const emailMatch = src.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = (emailMatch?.[0] || "")
      .replace(/^[<("'\[\s]+/, "")
      .replace(/[>)"'\]\s.,;:]+$/, "");

    // Message: support multiple phrasings (named/saying/message:/content:/titled:)
    let message = "";
    const named = src.match(/\bnamed\s+["“”']?(.+?)["“”']?$/i);
    const saying = src.match(/\bsaying\s+["“”']?(.+?)["“”']?$/i);
    const msgColon = src.match(/\bmessage\s*:\s*["“”']?(.+?)["“”']?$/i);
    const contentColon = src.match(/\bcontent\s*:\s*["“”']?(.+?)["“”']?$/i);
    const titled = src.match(/\btitled\s+["“”']?(.+?)["“”']?$/i);
    message = (
      named?.[1] ||
      saying?.[1] ||
      msgColon?.[1] ||
      contentColon?.[1] ||
      titled?.[1] ||
      ""
    ).trim();

    // As a last resort, if format is like: send "<msg>" to <email>
    if (!message) {
      const quotedThenTo = src.match(/send\s+["“”'](.+?)["“”']\s+to\s+[^\s]+/i);
      if (quotedThenTo) message = quotedThenTo[1].trim();
    }

    const confirm = /\b(send now|yes|confirm|go ahead|proceed)\b/i.test(src);
    return { email, message, confirm };
  }

  async function confirmAndSend(email, message) {
    setSending(true);
    try {
      await API.post(
        "/messages",
        { receiver_email: email, content: message },
        { headers: authHdr }
      );
      append("agent", `Message sent to ${email}.`, {
        action: { type: "openChat", email },
      });
      pendingRef.current = null;
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Send failed";
      append("agent", `Error: ${msg}`);
    } finally {
      setSending(false);
    }
  }

  const onSend = async () => {
    const q = input.trim();
    if (!q || busy || sending) return;
    append("user", q);
    setInput("");
    setBusy(true);

    try {
      // If awaiting confirmation, treat user reply as yes/no with lenient matching
      if (pendingRef.current) {
        if (/\b(yes|y|send|confirm|go ahead|proceed)\b/i.test(q)) {
          const { email, message } = pendingRef.current;
          await confirmAndSend(email, message);
        } else {
          append("agent", "Okay, cancelled. Start again anytime.");
          pendingRef.current = null;
        }
        return;
      }

      const { email, message, confirm } = await parseWithGemini(q);

      if (!email) {
        append("agent", "email is missing");
        return;
      }
      if (!message) {
        append("agent", "message is missing");
        return;
      }

      if (confirm) {
        await confirmAndSend(email, message);
        return;
      }

      pendingRef.current = { email, message };
      append(
        "agent",
        `Do you want to send this now?\nTo: ${email}\nMessage: "${message}"\nReply "yes" to confirm or anything else to cancel.`
      );
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }) => {
    const isAgent = item.role === "agent";
    const bubbleStyle = isAgent ? styles.agentBubble : styles.userBubble;
    return (
      <View style={styles.row}>
        <View style={[styles.bubble, bubbleStyle]}>
          <Text style={styles.text}>{item.text}</Text>
          {item.action?.type === "openChat" && (
            <TouchableOpacity
              style={styles.cta}
              onPress={() =>
                navigation.navigate("ChatWindow", {
                  contact: item.action.email,
                })
              }
            >
              <Icon name="open-in-new" size={16} color="#fff" />
              <Text style={styles.ctaTxt}>
                Open chat with {item.action.email}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          paddingTop: (StatusBar.currentHeight || 0) + 12,
          paddingHorizontal: 14,
          paddingBottom: 100,
        }}
        renderItem={renderItem}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the Agent"
          placeholderTextColor="#6d7d92"
          selectionColor={CLICK}
          multiline
        />
        <TouchableOpacity
          onPress={onSend}
          disabled={busy || sending || !input.trim()}
          style={[
            styles.sendBtn,
            (busy || sending || !input.trim()) && { opacity: 0.5 },
          ]}
        >
          {busy || sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b141a" },
  row: { flexDirection: "row", marginBottom: 10 },
  bubble: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  agentBubble: { backgroundColor: "#142332", borderColor: "#233d55" },
  userBubble: { backgroundColor: "#223b53", borderColor: "#2c4f6d" },
  text: { color: "#e9edef", fontSize: 13, lineHeight: 20 },
  composer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 18,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#182a3b",
    borderWidth: 1,
    borderColor: "#223b53",
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { flex: 1, color: "#e9edef", fontSize: 14, paddingVertical: 6 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CLICK,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  cta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLICK,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  ctaTxt: { color: "#fff", marginLeft: 6, fontSize: 12, fontWeight: "600" },
});
