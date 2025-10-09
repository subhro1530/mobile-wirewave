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
      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "600" }}>
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
            return <Icon name="auto-awesome" color={color} size={size} />; // CHANGED: keep icon
          if (route.name === "Groups")
            return <Icon name="groups" color={color} size={size} />;
          return null;
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatScreen} />
      {/* CHANGED: rename Updates -> Assistant */}
      <Tab.Screen name="Assistant" component={AssistantScreen} />
      <Tab.Screen name="Groups" component={CommunitiesScreen} />
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
