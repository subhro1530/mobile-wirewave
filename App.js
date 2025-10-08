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
import { View, Text } from "react-native";

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

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const BRAND_PRIMARY = "#3a7afe"; // updated to icon blue
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0d1220",
          borderTopColor: "#1d2740",
        },
        tabBarActiveTintColor: BRAND_PRIMARY,
        tabBarInactiveTintColor: "#7c8aa8",
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Chats")
            return <Icon name="chat" color={color} size={size} />;
          if (route.name === "Updates")
            return <Icon name="update" color={color} size={size} />;
          if (route.name === "Communities")
            return <Icon name="groups" color={color} size={size} />;
          return null;
        },
      })}
    >
      <Tab.Screen name="Chats" component={ChatScreen} />
      <Tab.Screen name="Updates">
        {() => <ComingSoonScreen title="Updates" />}
      </Tab.Screen>
      <Tab.Screen name="Communities">
        {() => <ComingSoonScreen title="Communities" />}
      </Tab.Screen>
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
