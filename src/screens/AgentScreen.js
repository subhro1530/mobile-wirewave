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
      text: "I’m the Agent. Try: “send a message to user@example.com named Hello there!”, or “list last 5 messages”, “show messages to me”, “show last 3 with user@example.com”. I’ll confirm before sending.",
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

  // NEW: clear transient session state so previous intents don't leak into new sessions
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem("agent:lastParsed");
      } catch {}
      pendingRef.current = null;
    })();
  }, []);

  const append = (role, text, extra = {}) =>
    setItems((p) => [
      ...p,
      { id: String(Date.now()) + Math.random(), role, text, ...extra },
    ]);

  // --- NEW: voice-style speaker (optional, best effort) ---
  const speakOut = useCallback(async (text) => {
    try {
      const mod = await import("expo-speech");
      const Speech = mod?.default ?? mod;
      if (Speech?.speak) {
        Speech.speak(text, {
          language: "en-US",
          pitch: 1.0,
          rate: 1.0,
        });
      }
    } catch {
      // no-op if expo-speech not installed
    }
  }, []);

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

  // --- NEW: list intent parsing (Gemini + regex fallback) ---
  function parseListWithRegex(text) {
    const src = String(text || "");
    const intent = /\b(list|show|fetch)\s+(my\s+)?(recent\s+)?messages\b/i.test(
      src
    )
      ? "list"
      : "";
    const nMatch =
      src.match(/\blast\s+(\d+)\b/i) || src.match(/\b(\d+)\s*messages?\b/i);
    const last_n = nMatch
      ? Math.max(1, Math.min(50, parseInt(nMatch[1], 10)))
      : 0;

    const with_email = (
      src.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ""
    ).trim();

    let direction = "any";
    if (/\b(to me|sent to me|received|inbox|for me)\b/i.test(src))
      direction = "to_me";
    if (/\b(from me|i sent|outbox)\b/i.test(src)) direction = "from_me";
    if (with_email) direction = "with_contact";

    const include_sender = true;
    return { intent, last_n, with_email, direction, include_sender };
  }

  async function parseListWithGemini(text) {
    if (!geminiKey) return parseListWithRegex(text);
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
                      "Extract ONLY JSON. Schema: " +
                      JSON.stringify({
                        intent: "list",
                        last_n: 0,
                        with_email: "",
                        direction: "any",
                        include_sender: true,
                      }) +
                      ". Rules: intent='list' if the user wants to view messages. last_n is how many (default 5 if not given). with_email is a single email if user asks for a specific contact. direction is one of any|to_me|from_me|with_contact. include_sender is true if they want sender names. Instruction: " +
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
      const fallback = parseListWithRegex(text);

      return {
        intent: parsed?.intent === "list" ? "list" : fallback.intent,
        last_n: Number(parsed?.last_n) || fallback.last_n || 5,
        with_email: (parsed?.with_email || fallback.with_email || "")
          .replace(/^[<("'\[\s]+/, "")
          .replace(/[>)"'\]\s.,;:]+$/, ""),
        direction: parsed?.direction || fallback.direction || "any",
        include_sender:
          typeof parsed?.include_sender === "boolean"
            ? parsed.include_sender
            : true,
      };
    } catch {
      return parseListWithRegex(text);
    }
  }

  // --- NEW: POST-first listing with fallbacks ---
  async function tryPostList(payload) {
    const endpoints = ["/messages/list", "/messages/query", "/messages/search"];
    for (const ep of endpoints) {
      try {
        const { data } = await API.post(ep, payload, { headers: authHdr });
        if (data) return data;
      } catch {}
    }
    return null;
  }

  async function fetchAllMessagesFallback() {
    try {
      const { data } = await API.get("/messages", { headers: authHdr });
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function coerceMessagesShape(list) {
    // Normalize a few possible backend shapes
    return (Array.isArray(list) ? list : []).map((m) => ({
      id:
        m.id ??
        m._id ??
        `${m.sender_email || ""}-${m.sent_at || ""}-${Math.random()}`,
      sender_email: m.sender_email ?? m.from ?? m.sender ?? "",
      sender_name: m.sender_name ?? m.senderFullName ?? m.name ?? "",
      receiver_email: m.receiver_email ?? m.to ?? m.receiver ?? "",
      content: m.content ?? m.text ?? m.message ?? "",
      sent_at: m.sent_at ?? m.created_at ?? m.timestamp ?? Date.now(),
    }));
  }

  async function summarizeMessagesWithGemini(messages, opts = {}) {
    const fallback = () => {
      const lines = messages.map((m, i) => {
        const fromName = (m.sender_name || m.sender_email || "Unknown").trim();
        const msg = String(m.content || "")
          .replace(/\s+/g, " ")
          .trim();
        const t = new Date(m.sent_at).toLocaleString();
        return `${i + 1}. From ${fromName} @ ${t}: ${msg}`;
      });
      return lines.join("\n");
    };

    if (!geminiKey) return fallback();

    try {
      const prompt = `Turn these messages into a concise, voice-assistant style readout. 
- Keep it brief and natural.
- Include sender names (or emails).
- One short line per message.
- No markdown, no code fences.

Messages JSON:
${JSON.stringify(messages.slice(0, 20))}`;

      const resp = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          encodeURIComponent(geminiKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          }),
        }
      );
      const data = await resp.json();
      const out =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.candidates?.[0]?.content?.parts?.[0]?.raw_text ??
        "";
      const text = String(out || "").trim();
      return text || fallback();
    } catch {
      return fallback();
    }
  }

  async function listMessagesAdvanced(listReq) {
    const limit = Math.max(1, Math.min(50, listReq?.last_n || 5));
    const payload = {
      limit,
      with_email: listReq?.with_email || undefined,
      direction: listReq?.direction || "any", // let backend resolve 'to_me' based on auth
      include_sender: true,
    };

    // Try POST-first
    let raw = await tryPostList(payload);
    if (!raw) {
      // Fallback: GET and filter locally
      const all = await fetchAllMessagesFallback();
      raw = all;
      // local filter for with_email if provided
      if (listReq?.with_email) {
        raw = raw.filter(
          (m) =>
            m.sender_email === listReq.with_email ||
            m.receiver_email === listReq.with_email
        );
      }
    }

    const normalized = coerceMessagesShape(raw || [])
      .sort(
        (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      )
      .slice(-limit);

    if (!normalized.length) {
      append(
        "agent",
        listReq?.with_email
          ? `No messages found with ${listReq.with_email}.`
          : "No messages found."
      );
      return;
    }

    const summary = await summarizeMessagesWithGemini(normalized);
    append("agent", summary);
    speakOut(summary); // optional voice output
  }

  async function confirmAndSend(email, message) {
    setSending(true);
    try {
      await API.post(
        "/messages",
        { receiver_email: email, content: message },
        { headers: authHdr }
      );
      await AsyncStorage.setItem("agent:lastEmail", email);
      // NEW: wipe transient parse snapshot after a successful send
      try {
        await AsyncStorage.removeItem("agent:lastParsed");
      } catch {}
      setLastEmail(email);
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
      // NEW: resolve pending confirmations first (prevents wrong intent routing)
      if (pendingRef.current) {
        if (/\b(yes|y|send|confirm|go ahead|proceed)\b/i.test(q)) {
          const { email, message } = pendingRef.current;
          await confirmAndSend(email, message);
        } else {
          append("agent", "Okay, cancelled. Start again anytime.");
          pendingRef.current = null;
          // NEW: clear transient parse snapshot on cancel
          try {
            await AsyncStorage.removeItem("agent:lastParsed");
          } catch {}
        }
        return;
      }

      // NEW: prefer send-like intents over list
      const isSendLike =
        /\b(send|message|mail|text|deliver|forward|post)\b/i.test(q);
      if (!isSendLike) {
        const listParse = await parseListWithGemini(q);
        if (listParse.intent === "list" || isListIntent(q)) {
          const effective = {
            ...listParse,
            last_n: listParse.last_n || 5,
          };
          await listMessagesAdvanced(effective);
          return;
        }
      }

      // Parse intent for direct send
      let { email, message, confirm } = await parseWithGemini(q);

      // Use last email if missing
      if (!email && lastEmail) email = lastEmail;

      // CHANGED: stop persisting lastParsed to avoid stale intent confusion
      // try {
      //   await AsyncStorage.setItem(
      //     "agent:lastParsed",
      //     JSON.stringify({ email, message, confirm, at: Date.now() })
      //   );
      // } catch {}

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

// CHANGED: stricter list-intent detector; never triggers when the user asks to send
function isListIntent(text = "") {
  const t = String(text || "").toLowerCase();
  const hasListWord = /\b(list|show|see|display|fetch|view)\b/.test(t);
  const mentionsMessages = /\b(messages?|chats?|inbox|outbox|threads?)\b/.test(
    t
  );
  const looksLikeSend =
    /\b(send|message|mail|text|deliver|forward|post|to\s+\S+)\b/.test(t);
  return hasListWord && mentionsMessages && !looksLikeSend;
}
