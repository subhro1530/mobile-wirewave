import React, {
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useNavigation } from "@react-navigation/native";
import { AuthContext } from "../AuthContext";
import API from "../api";

const CLICK = "#3a7afe";
const HEADER_HEIGHT = 52;

export default function AgentScreen() {
  const navigation = useNavigation();
  const { userToken } = useContext(AuthContext);
  const authHdr = useMemo(
    () => (userToken ? { Authorization: `Bearer ${userToken}` } : undefined),
    [userToken]
  );
  const geminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
  const hfToken =
    process.env.EXPO_PUBLIC_HF_TOKEN || process.env.HF_TOKEN || ""; // NEW
  const TOP_PAD = (StatusBar.currentHeight || 0) + 12; // NEW: leave space at top

  // Helper: infer mime from uri extension (defaults to octet-stream)
  const mimeFromUri = (uri) => {
    if (!uri) return "application/octet-stream";
    const u = uri.toLowerCase();
    if (u.endsWith(".wav")) return "audio/wav";
    if (u.endsWith(".flac")) return "audio/flac";
    if (u.endsWith(".m4a") || u.endsWith(".mp4")) return "audio/m4a";
    if (u.endsWith(".mp3")) return "audio/mpeg";
    if (u.endsWith(".webm")) return "audio/webm";
    return "application/octet-stream";
  };

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
  const [enhancing, setEnhancing] = useState(false); // NEW
  const [lastEmail, setLastEmail] = useState(""); // NEW
  const [rec, setRec] = useState(null); // NEW: recording handle
  const [recBusy, setRecBusy] = useState(false); // NEW
  const pendingRef = useRef(null); // { email, message }

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem("agent:lastEmail");
      if (saved) setLastEmail(saved);
    })();
  }, []);

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

  // NEW: detect "list messages" intent and optional target email
  function isListIntent(text) {
    return /\b(list|show|fetch)\s+(all\s+)?messages\b/i.test(text);
  }
  function extractEmailForList(text) {
    const m = String(text || "").match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    return m?.[0] || "";
  }

  // NEW: list messages from API and render a compact summary
  async function listMessages(targetEmail) {
    try {
      const { data } = await API.get("/messages", { headers: authHdr });
      const all = Array.isArray(data) ? data : [];
      const recent = targetEmail
        ? all.filter(
            (m) =>
              m.sender_email === targetEmail || m.receiver_email === targetEmail
          )
        : all;
      if (!recent.length) {
        append(
          "agent",
          targetEmail
            ? `No messages with ${targetEmail}.`
            : "No messages found."
        );
        return;
      }
      const last10 = recent
        .sort(
          (a, b) =>
            new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        )
        .slice(-10);
      const lines = last10.map((m) => {
        const me =
          m.sender_email && m.sender_email !== targetEmail ? "You" : "They";
        const t = new Date(m.sent_at).toLocaleString();
        return `${me} @ ${t}: ${m.content}`;
      });
      append(
        "agent",
        `Recent messages${targetEmail ? ` with ${targetEmail}` : ""}:\n` +
          lines.join("\n")
      );
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        e?.message ||
        "Failed to load messages";
      append("agent", `Error: ${msg}`);
    }
  }

  async function confirmAndSend(email, message) {
    setSending(true);
    try {
      await API.post(
        "/messages",
        { receiver_email: email, content: message },
        { headers: authHdr }
      );
      // Persist last email for subsequent sends
      await AsyncStorage.setItem("agent:lastEmail", email); // NEW
      setLastEmail(email); // NEW
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

  // NEW: enhance the current input using backend enhancer
  const enhanceInput = useCallback(async () => {
    const draft = (input || "").trim();
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
      if (out) setInput(out);
    } catch {
      // silent
    } finally {
      setEnhancing(false);
    }
  }, [input, enhancing, authHdr]);

  // Transcribe local audio URI with Hugging Face Inference API (Whisper)
  const transcribeAudio = useCallback(
    async (uri) => {
      try {
        if (!hfToken) {
          append("agent", "ASR not configured (missing Hugging Face token).");
          return "";
        }
        const audioResp = await fetch(uri);
        const blob = await audioResp.blob();
        const contentType = mimeFromUri(uri);

        const resp = await fetch(
          "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken}`,
              Accept: "application/json",
              "Content-Type": contentType, // CHANGED: force audio content-type
            },
            body: blob,
          }
        );

        if (!resp.ok) {
          const errTxt = await resp.text();
          throw new Error(
            `ASR ${resp.status}: ${errTxt?.slice(0, 200) || "Unknown error"}`
          );
        }
        const json = await resp.json();
        const text = (
          typeof json === "string"
            ? json
            : json?.text || json?.generated_text || ""
        )
          .toString()
          .trim();
        return text;
      } catch (e) {
        append("agent", `ASR error: ${e?.message || "transcription failed"}`);
        return "";
      }
    },
    [hfToken, append]
  );

  // NEW: load a Recording-capable Audio API (prefer expo-audio, fallback expo-av)
  const loadRecordingAPI = useCallback(async () => {
    try {
      const modAudio = await import("expo-audio");
      if (modAudio?.Audio?.Recording) return modAudio.Audio;
    } catch {}
    try {
      const modAV = await import("expo-av");
      if (modAV?.Audio?.Recording) return modAV.Audio;
    } catch {}
    return null;
  }, []);

  // Prefer expo-audio; fallback to expo-av. Record as m4a (high quality) to avoid 3gpp.
  const startVoice = useCallback(async () => {
    if (rec || recBusy) return;
    setRecBusy(true);
    try {
      const AudioAPI = await loadRecordingAPI();
      if (!AudioAPI) {
        append(
          "agent",
          "Recording is unavailable. Install expo-av: npx expo install expo-av"
        );
        setRecBusy(false);
        return;
      }

      // SAFE permission handling
      let permStatus = "granted";
      try {
        if (typeof AudioAPI.getPermissionsAsync === "function") {
          const res = await AudioAPI.getPermissionsAsync();
          permStatus = res?.status || permStatus;
          if (
            permStatus !== "granted" &&
            typeof AudioAPI.requestPermissionsAsync === "function"
          ) {
            const req = await AudioAPI.requestPermissionsAsync();
            permStatus = req?.status || "denied";
          }
        } else if (typeof AudioAPI.requestPermissionsAsync === "function") {
          const req = await AudioAPI.requestPermissionsAsync();
          permStatus = req?.status || "denied";
        }
      } catch {
        // some platforms will prompt implicitly
      }
      if (permStatus !== "granted") {
        append("agent", "Microphone permission denied.");
        setRecBusy(false);
        return;
      }

      try {
        if (typeof AudioAPI.setAudioModeAsync === "function") {
          await AudioAPI.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            interruptionModeAndroid: 1,
            shouldDuckAndroid: true,
            staysActiveInBackground: false,
          });
        }
      } catch {}

      const RecordingCtor = AudioAPI?.Recording;
      if (!RecordingCtor) {
        append("agent", "Recording API unavailable (no Audio.Recording).");
        setRecBusy(false);
        return;
      }

      const recording = new RecordingCtor();
      const HQ =
        AudioAPI.RECORDING_OPTIONS_PRESET_HIGH_QUALITY ||
        AudioAPI.RecordingOptionsPresets?.HIGH_QUALITY;
      await recording.prepareToRecordAsync(HQ || {});
      await recording.startAsync();

      setRec(recording);
      append("agent", "Recording… tap again to stop.");
    } catch (e) {
      append("agent", e?.message || "Failed to start recording.");
    } finally {
      setRecBusy(false);
    }
  }, [rec, recBusy, loadRecordingAPI, append]);

  const stopVoice = useCallback(async () => {
    if (!rec || recBusy) return;
    setRecBusy(true);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRec(null);
      append("agent", "Transcribing…");
      const transcript = await transcribeAudio(uri);
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        append("agent", `Transcript: "${transcript}"`);
      } else {
        append("agent", "No speech detected.");
      }
    } catch (e) {
      append("agent", e?.message || "Failed to stop recording.");
    } finally {
      setRecBusy(false);
    }
  }, [rec, recBusy, transcribeAudio, append]);

  const onSend = async () => {
    const q = input.trim();
    if (!q || busy || sending) return;
    append("user", q);
    setInput("");
    setBusy(true);

    try {
      // Handle list intent first
      if (isListIntent(q)) {
        const target = extractEmailForList(q) || lastEmail || "";
        if (!target && /\bwith\b/i.test(q)) {
          append("agent", "email is missing");
        } else {
          await listMessages(target);
        }
        return;
      }

      // If awaiting confirmation, treat user reply as yes/no
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

      // Parse intent
      let { email, message, confirm } = await parseWithGemini(q);

      // Use last email if missing
      if (!email && lastEmail) email = lastEmail;

      // Persist latest parse snapshot (for continuity UX)
      try {
        await AsyncStorage.setItem(
          "agent:lastParsed",
          JSON.stringify({ email, message, confirm, at: Date.now() })
        );
      } catch {}

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

  // Remove header title; add top space via padding only
  // const Header = () => ( ... )  // REMOVE

  // KeyboardAvoidingView remains (padding iOS, height Android)
  const kavBehavior = Platform.OS === "ios" ? "padding" : "height";
  const kavOffset = Platform.OS === "ios" ? 12 : 0; // minimal offset; no title bar

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0b141a" }}
      behavior={kavBehavior}
      keyboardVerticalOffset={kavOffset}
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      {/* Top spacer instead of title */}
      <View style={{ height: TOP_PAD }} /> {/* NEW */}
      <View style={{ flex: 1 }}>
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            paddingTop: 8,
            paddingHorizontal: 14,
            paddingBottom: 8, // composer is in-flow
          }}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
        />
      </View>
      {/* Composer in normal flow at bottom */}
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
          onPress={enhanceInput}
          disabled={!input.trim() || enhancing}
          style={[
            styles.iconBtn,
            (!input.trim() || enhancing) && { opacity: 0.5 },
          ]}
        >
          {enhancing ? (
            <ActivityIndicator color="#9ab1c1" size="small" />
          ) : (
            <Icon name="auto-awesome" size={20} color="#9ab1c1" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={rec ? stopVoice : startVoice}
          disabled={recBusy}
          style={[styles.iconBtn, recBusy && { opacity: 0.5 }]}
        >
          <Icon
            name={rec ? "stop" : "keyboard-voice"}
            size={rec ? 20 : 22}
            color={rec ? "#ff7373" : "#9ab1c1"}
          />
        </TouchableOpacity>
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
    </KeyboardAvoidingView>
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
    // in-flow bottom bar (no absolute)
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#182a3b",
    borderWidth: 1,
    borderColor: "#223b53",
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 6,
    margin: 12,
    marginTop: 0,
  },
  input: { flex: 1, color: "#e9edef", fontSize: 14, paddingVertical: 6 },
  iconBtn: {
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
