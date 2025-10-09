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
  const [userid, setUserid] = useState("");
  const [password, setPassword] = useState("");
  const [banner, setBanner] = useState(null);

  const handleRegister = async () => {
    if (!email || !password || !userid) {
      setBanner({ type: "error", msg: "Please fill in all fields" });
      return;
    }
    try {
      const res = await fetch("http://65.20.73.50:4000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, userid }),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore JSON parse errors; fall back to generic messages
      }

      if (res.ok) {
        setBanner({
          type: "success",
          msg: "Account created successfully. Please login.",
        });
        setTimeout(() => navigation.navigate("Login"), 900);
        return;
      }

      // Non-2xx: show server-provided reason (email/user exists, etc.)
      const serverMsg =
        (data && (data.error || data.message || data.detail)) ||
        (res.status === 409
          ? "Email or username already exists"
          : "Registration failed");
      setBanner({ type: "error", msg: serverMsg });
    } catch (err) {
      setBanner({ type: "error", msg: err.message || "Network error" });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <View style={styles.inner}>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        {!!banner && (
          <View
            style={[
              styles.banner,
              banner.type === "success"
                ? styles.bannerSuccess
                : styles.bannerError,
            ]}
          >
            <Icon
              name={
                banner.type === "success" ? "check-circle" : "error-outline"
              }
              size={16}
              color="#fff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.bannerTxt}>{banner.msg}</Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          onChangeText={(t) => {
            setEmail(t);
            if (banner) setBanner(null);
          }}
          value={email}
          selectionColor="#3a7afe"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#999"
          onChangeText={(t) => {
            setUserid(t);
            if (banner) setBanner(null);
          }}
          value={userid}
          selectionColor="#3a7afe"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          onChangeText={(t) => {
            setPassword(t);
            if (banner) setBanner(null);
          }}
          value={password}
          selectionColor="#3a7afe"
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
    paddingTop:
      (Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0) + 6,
    paddingBottom: 0,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 12,
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
    borderWidth: 1,
    borderColor: "#25304a",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3a7afe",
    paddingHorizontal: 24,
    height: 56,
    borderRadius: 28,
    marginTop: 6,
    shadowColor: "#3a7afe",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  bannerSuccess: {
    backgroundColor: "#1d3d55",
    borderWidth: 1,
    borderColor: "#2e5d7d",
  },
  bannerError: {
    backgroundColor: "#552222",
    borderWidth: 1,
    borderColor: "#7d3a3a",
  },
  bannerTxt: { color: "#fff", fontSize: 12, flexShrink: 1 },
});
