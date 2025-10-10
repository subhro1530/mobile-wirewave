import React, { useState, useContext } from "react";
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
import { AuthContext } from "../AuthContext";
import API from "../api"; // use axios instance for optional profile fetch

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [banner, setBanner] = useState(null); // { type: 'success'|'error', msg: string }
  const { login } = useContext(AuthContext);

  const handleLogin = async () => {
    if (!email || !password) {
      setBanner({ type: "error", msg: "Please fill in all fields" });
      return;
    }
    try {
      const isEmail = email.includes("@");
      const res = await fetch("https://backend-wirewave.onrender.com/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEmail ? { email, password } : { userid: email, password }
        ),
      });
      const data = await res.json();
      if (res.ok && data?.token) {
        // make token available to axios interceptor immediately
        global.authToken = data.token; // ADDED

        // optimistic email source
        let loginEmail = isEmail ? email : data.email || "";
        // store token (and a best-effort email)
        await login(data.token, loginEmail);
        setBanner({ type: "success", msg: "Login successful" });
        // If user logged in by userid and email not returned, try to fetch profile email
        if (!isEmail && !data.email) {
          try {
            const me = await API.get("/profile"); // will carry Bearer via interceptor
            // use user_email from profile response
            if (me?.data?.user_email) {
              await login(data.token, me.data.user_email); // update stored email
            }
          } catch {
            // ignore; app will still work with userid until messages load
          }
        }
      } else {
        setBanner({ type: "error", msg: data?.error || "Login failed" });
      }
    } catch (err) {
      setBanner({ type: "error", msg: err.message });
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
          placeholder="Email or Username"
          placeholderTextColor="#999"
          onChangeText={(t) => {
            setEmail(t);
            if (banner) setBanner(null);
          }}
          value={email}
          selectionColor="#3a7afe"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry
          onChangeText={setPassword}
          value={password}
          selectionColor="#3a7afe"
        />
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleLogin}
          accessibilityLabel="Log in"
        >
          <Icon name="login" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("Register")}
          style={styles.linkButton}
          accessibilityLabel="Go to register"
        >
          <Icon name="person-add-alt" size={20} color="#aaa" />
          <Text style={styles.linkButtonText}>Register</Text>
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
