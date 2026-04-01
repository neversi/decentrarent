import { useRef, useState } from 'react';
import { SafeAreaView, ActivityIndicator, Platform, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import { useEffect } from 'react';
import Constants from 'expo-constants';

// In dev, Android emulator uses 10.0.2.2 to reach host machine's localhost.
// iOS simulator and physical devices on same network can use the host IP.
// Update FRONTEND_URL if your frontend runs on a different host/port.
const DEV_HOST = Platform.select({
  android: '10.0.2.2',
  default: 'localhost',
});

const FRONTEND_URL =
  Constants.expoConfig?.extra?.frontendUrl ?? `http://${DEV_HOST}:5173`;

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  // Handle Android back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBack = () => {
      if (webviewRef.current) {
        webviewRef.current.goBack();
        return true; // prevent default
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <WebView
        ref={webviewRef}
        source={{ uri: FRONTEND_URL }}
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <ActivityIndicator
            color="#9945FF"
            size="large"
            style={{ position: 'absolute', top: '50%', left: '50%', marginLeft: -18, marginTop: -18 }}
          />
        )}
      />
    </SafeAreaView>
  );
}