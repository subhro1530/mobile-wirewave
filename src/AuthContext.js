import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AuthContext = createContext();

// Set to false to allow session restore (prevents unintended token wipe)
const CLEAR_SESSION_ON_START = false;

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (CLEAR_SESSION_ON_START) {
        await AsyncStorage.multiRemove(["userToken", "userEmail"]);
        global.authToken = null;
        setUserToken(null);
        setUserEmail(null);
        return;
      }
      const [token, email] = await AsyncStorage.multiGet([
        "userToken",
        "userEmail",
      ]);
      const t = token?.[1];
      const e = email?.[1];
      if (t) {
        setUserToken(t);
        global.authToken = t;
      }
      if (e) setUserEmail(e);
    };
    init();
  }, []);

  const login = async (token, email) => {
    setUserToken(token);
    global.authToken = token;
    if (email) setUserEmail(email);
    await AsyncStorage.multiSet([
      ["userToken", token],
      ["userEmail", email || ""],
    ]);
  };

  const logout = async () => {
    setUserToken(null);
    setUserEmail(null);
    global.authToken = null;
    await AsyncStorage.multiRemove(["userToken", "userEmail"]);
  };

  return (
    <AuthContext.Provider value={{ userToken, userEmail, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
