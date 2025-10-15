import React, { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ChatWindowScreen from "./src/screens/ChatWindow";
import { AuthProvider, AuthContext } from "./src/AuthContext";
import Icon from "react-native-vector-icons/MaterialIcons";
import {
  View,
  Text,
  StatusBar,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import CommunitiesScreen from "./src/screens/CommunitiesScreen";
import API from "./src/api"; // ADDED
import AgentScreen from "./src/screens/AgentScreen"; // NEW

// Empty screens for Communities and Updates
function ComingSoonScreen({ title }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#101010",
      }}
    >
      <Text style={{ color: "#ffffffff", fontSize: 18, fontWeight: "600" }}>
        {title}
      </Text>
      <Text style={{ color: "#aaa", marginTop: 8 }}>Feature coming soon</Text>
    </View>
  );
}

// NEW: AI Assistant screen (chat-style)
function AssistantScreen() {
  const { userToken } = useContext(AuthContext);
  const authHdr = userToken
    ? { Authorization: `Bearer ${userToken}` }
    : undefined;
  const [items, setItems] = React.useState([
    {
      id: "greet",
      role: "bot",
      text: "Hi! I’m your AI assistant. Ask me anything and I’ll reply in clear, short paragraphs with next-step suggestions.",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [enhancing, setEnhancing] = React.useState(false); // NEW
  const hfToken =
    process.env.EXPO_PUBLIC_HF_TOKEN || process.env.HF_TOKEN || ""; // NEW
  const [rec, setRec] = React.useState(null); // NEW
  const [recBusy, setRecBusy] = React.useState(false); // NEW

  const send = React.useCallback(async () => {
    const q = input.trim();
    if (!q || busy) return;
    const userMsg = { id: String(Date.now()), role: "user", text: q };
    setItems((p) => [...p, userMsg]);
    setInput("");
    setBusy(true);
    try {
      // Style prompt to enforce paragraphs, no bullets/stars, and proactive tone
      const stylePrompt =
        "Answer in 1–3 short paragraphs. Do not use bullet points, numbers, or stars. Be crisp, helpful, and proactively suggest next steps. Query: " +
        q;
      const { data } = await API.post(
        "/ai/assistant",
        { query: stylePrompt },
        { headers: authHdr }
      );
      const ans =
        (data?.answer || "").toString().trim() ||
        "Sorry, I couldn’t find an answer.";
      setItems((p) => [
        ...p,
        { id: "bot_" + Date.now(), role: "bot", text: ans },
      ]);
    } catch (e) {
      setItems((p) => [
        ...p,
        {
          id: "bot_" + Date.now(),
          role: "bot",
          text:
            e?.response?.data?.error ||
            e?.message ||
            "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, authHdr]);

  // NEW: enhance current input using the same pattern as chats
  const enhanceInput = React.useCallback(async () => {
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
      // silent; keep UX simple in assistant input
    } finally {
      setEnhancing(false);
    }
  }, [input, enhancing, authHdr]);

  // NEW: mime helper
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

  // NEW: transcribe
  const transcribeAudio = React.useCallback(
    async (uri) => {
      try {
        if (!hfToken) {
          setItems((p) => [
            ...p,
            { id: "e" + Date.now(), role: "bot", text: "ASR not configured" },
          ]);
          return "";
        }
        const blob = await fetch(uri).then((r) => r.blob());
        const contentType = mimeFromUri(uri);
        const resp = await fetch(
          "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken}`,
              Accept: "application/json",
              "Content-Type": contentType,
            },
            body: blob,
          }
        );
        if (!resp.ok)
          throw new Error(
            `${resp.status}: ${(await resp.text()).slice(0, 160)}`
          );
        const json = await resp.json();
        return (
          typeof json === "string"
            ? json
            : json?.text || json?.generated_text || ""
        )
          .toString()
          .trim();
      } catch (e) {
        setItems((p) => [
          ...p,
          {
            id: "e" + Date.now(),
            role: "bot",
            text: `ASR error: ${e?.message || ""}`,
          },
        ]);
        return "";
      }
    },
    [hfToken]
  );

  // NEW: load Recording API
  const loadRecordingAPI = React.useCallback(async () => {
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

  // NEW: start/stop
  const startVoice = React.useCallback(async () => {
    if (rec || recBusy) return;
    setRecBusy(true);
    try {
      const AudioAPI = await loadRecordingAPI();
      if (!AudioAPI) {
        setItems((p) => [
          ...p,
          {
            id: "e" + Date.now(),
            role: "bot",
            text: "Recording unavailable (install expo-av)",
          },
        ]);
        return;
      }
      let status = "granted";
      try {
        if (typeof AudioAPI.getPermissionsAsync === "function") {
          const r = await AudioAPI.getPermissionsAsync();
          status = r?.status || status;
          if (
            status !== "granted" &&
            typeof AudioAPI.requestPermissionsAsync === "function"
          ) {
            const r2 = await AudioAPI.requestPermissionsAsync();
            status = r2?.status || "denied";
          }
        } else if (typeof AudioAPI.requestPermissionsAsync === "function") {
          const r = await AudioAPI.requestPermissionsAsync();
          status = r?.status || "denied";
        }
      } catch {}
      if (status !== "granted") {
        setItems((p) => [
          ...p,
          {
            id: "e" + Date.now(),
            role: "bot",
            text: "Microphone permission denied.",
          },
        ]);
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
      const Recording = AudioAPI.Recording;
      const recInst = new Recording();
      const HQ =
        AudioAPI.RECORDING_OPTIONS_PRESET_HIGH_QUALITY ||
        AudioAPI.RecordingOptionsPresets?.HIGH_QUALITY ||
        {};
      await recInst.prepareToRecordAsync(HQ);
      await recInst.startAsync();
      setRec(recInst);
      setItems((p) => [
        ...p,
        {
          id: "n" + Date.now(),
          role: "bot",
          text: "Recording… tap the mic again to stop.",
        },
      ]);
    } finally {
      setRecBusy(false);
    }
  }, [rec, recBusy, loadRecordingAPI]);

  const stopVoice = React.useCallback(async () => {
    if (!rec || recBusy) return;
    setRecBusy(true);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRec(null);
      const t = await transcribeAudio(uri);
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    } finally {
      setRecBusy(false);
    }
  }, [rec, recBusy, transcribeAudio]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0b141a" }}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        // leave space for top notification dropdown
        contentContainerStyle={{
          paddingTop: (StatusBar.currentHeight || 0) + 12,
          paddingHorizontal: 14,
          paddingBottom: 100,
        }}
        renderItem={({ item }) => {
          const isBot = item.role === "bot";
          return (
            <View
              style={{
                flexDirection: "row",
                marginBottom: 10,
                alignItems: "flex-start",
              }}
            >
              {isBot ? (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#20344d",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 8,
                  }}
                >
                  <Icon name="smart-toy" size={18} color="#9cc2ff" />
                </View>
              ) : (
                <View style={{ width: 40 }} />
              )}
              <View
                style={{
                  flex: 1,
                  backgroundColor: isBot ? "#142332" : "#223b53",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isBot ? "#233d55" : "#2c4f6d",
                  padding: 10,
                }}
              >
                <Text
                  style={{ color: "#e9edef", fontSize: 13, lineHeight: 20 }}
                >
                  {item.text}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <View
        style={{
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
        }}
      >
        <TextInput
          style={{
            flex: 1,
            color: "#e9edef",
            fontSize: 14,
            paddingVertical: 6,
          }}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the AI assistant"
          placeholderTextColor="#6d7d92"
          selectionColor="#3a7afe"
          multiline
        />
        {/* NEW: Enhance button (auto-awesome) */}
        <TouchableOpacity
          onPress={enhanceInput}
          disabled={!input.trim() || enhancing}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 6,
            opacity: !input.trim() || enhancing ? 0.5 : 1,
          }}
        >
          {enhancing ? (
            <ActivityIndicator color="#9ab1c1" size="small" />
          ) : (
            <Icon name="auto-awesome" size={20} color="#9ab1c1" />
          )}
        </TouchableOpacity>
        {/* NEW: Voice */}
        <TouchableOpacity
          onPress={rec ? stopVoice : startVoice}
          disabled={recBusy}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 6,
            opacity: recBusy ? 0.5 : 1,
          }}
        >
          <Icon
            name={rec ? "stop" : "keyboard-voice"}
            size={rec ? 20 : 22}
            color={rec ? "#ff7373" : "#9ab1c1"}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={send}
          disabled={busy || !input.trim()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#3a7afe",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 6,
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const BRAND_PRIMARY = "#3a7afe";
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0d1220",
          borderTopColor: "#1d2740",
          paddingBottom: 6,
          height: 64,
        },
        tabBarActiveTintColor: BRAND_PRIMARY,
        tabBarInactiveTintColor: "#7c8aa8",
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Chats")
            return <Icon name="chat" color={color} size={size} />;
          if (route.name === "Assistant")
            return <Icon name="auto-awesome" color={color} size={size} />;
          if (route.name === "Groups")
            return <Icon name="groups" color={color} size={size} />;
          if (route.name === "Agent")
            return <Icon name="support-agent" color={color} size={size} />; // NEW
          return null;
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatScreen} />
      {/* CHANGED: rename Updates -> Assistant */}
      <Tab.Screen name="Assistant" component={AssistantScreen} />
      <Tab.Screen name="Groups" component={CommunitiesScreen} />
      <Tab.Screen name="Agent" component={AgentScreen} />
      {/* NEW: to the right of Groups */}
    </Tab.Navigator>
  );
}

function AppStack() {
  const { userToken } = useContext(AuthContext);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {userToken ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="ChatWindow" component={ChatWindowScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <AppStack />
      </NavigationContainer>
    </AuthProvider>
  );
}
