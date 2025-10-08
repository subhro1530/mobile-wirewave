import React, { useContext, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import ChatWindow from "../components/ChatWindow";
import { AuthContext } from "../AuthContext";
import API from "../api";
import { useRoute } from "@react-navigation/native";

export default function ChatWindowScreen() {
  const { userEmail } = useContext(AuthContext);
  const route = useRoute();
  const contact = route.params?.contact;

  // You may want to fetch messages for this contact only, or pass all messages and filter inside ChatWindow.
  // For now, just pass contact and userEmail.
  // You can extend this to fetch messages for the contact if needed.

  return (
    <View style={styles.container}>
      <ChatWindow
        activeContact={contact}
        currentUserEmail={userEmail}
        messages={[]} // You can fetch and pass messages here
        onRefresh={() => {}}
        onClear={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
});
