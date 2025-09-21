import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";

export default function RegisterScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    try {
      const res = await fetch("https://wirewaveapi.onrender.com/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Success", "Account created. You can login now.");
        navigation.navigate("Login");
      } else {
        Alert.alert("Error", data.error || "Registration failed");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Image
        source={require("../../assets/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        onChangeText={setEmail}
        value={email}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        secureTextEntry
        onChangeText={setPassword}
        value={password}
      />
      <TouchableOpacity
        style={styles.actionButton}
        onPress={handleRegister}
        accessibilityLabel="Create account"
      >
        <Icon name="check-circle" size={24} color="#fff" />
        <Text style={styles.actionButtonText}>Register</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate("Login")}
        style={styles.linkButton}
        accessibilityLabel="Back to login"
      >
        <Icon name="login" size={20} color="#aaa" />
        <Text style={styles.linkButtonText}>Login</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    paddingTop:
      (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0) + 12,
    paddingBottom: 16,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 30,
  },
  input: {
    width: "100%",
    backgroundColor: "#1e1e1e",
    padding: 15,
    borderRadius: 10,
    color: "#fff",
    marginBottom: 15,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3a7afe",
    paddingHorizontal: 24,
    height: 56,
    borderRadius: 28,
    marginTop: 6,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    marginLeft: 10,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  linkButtonText: {
    color: "#aaa",
    fontSize: 14,
    marginLeft: 6,
  },
  link: {
    color: "#aaa",
    marginTop: 10,
  },
});
