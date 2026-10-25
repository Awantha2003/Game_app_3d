// Wanni Front for Android: the game (https://wanni-front.vercel.app) in a
// full-screen WebView. Co-op voice chat asks for the microphone permission
// the first time a player turns the microphone on.

import { useEffect, useRef, useState } from 'react';
import { BackHandler, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const GAME_URL = 'https://wanni-front.vercel.app/';

// Before the page loads: route the game's microphone request through the app,
// so Android can show its own permission prompt first.
const MIC_BRIDGE = `(function () {
  var md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  var original = md.getUserMedia.bind(md);
  md.getUserMedia = function (c) {
    return new Promise(function (resolve, reject) {
      window.__wanniMic = function (ok) {
        if (ok) original(c).then(resolve, reject);
        else reject(new Error('Microphone permission was not given'));
      };
      window.ReactNativeWebView.postMessage('mic');
    });
  };
})(); true;`;

export default function App() {
  const web = useRef(null);
  const [failed, setFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // the Android back button goes back inside the game page first
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { web.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const onMessage = async (e) => {
    if (e.nativeEvent.data !== 'mic') return;
    let ok = true;
    if (Platform.OS === 'android') {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone for co-op voice chat',
        message: 'Wanni Front uses the microphone only while you turn on voice chat in a co-op game.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      ok = r === PermissionsAndroid.RESULTS.GRANTED;
    }
    web.current?.injectJavaScript(`window.__wanniMic && window.__wanniMic(${ok}); true;`);
  };

  if (failed) {
    return (
      <View style={styles.offline}>
        <StatusBar hidden />
        <Text style={styles.title}>WANNI FRONT</Text>
        <Text style={styles.text}>The game needs an internet connection to load.</Text>
        <Pressable style={styles.button} onPress={() => setFailed(false)}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        ref={web}
        style={styles.root}
        source={{ uri: GAME_URL }}
        originWhitelist={['https://*']}
        injectedJavaScriptBeforeContentLoaded={MIC_BRIDGE}
        onMessage={onMessage}
        onNavigationStateChange={(s) => setCanGoBack(s.canGoBack)}
        onError={() => setFailed(true)}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        allowsBackForwardNavigationGestures={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c06' },
  offline: { flex: 1, backgroundColor: '#0a0c06', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#e0b84a', fontSize: 30, letterSpacing: 4, marginBottom: 12 },
  text: { color: '#d8d2bf', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  button: { borderColor: '#e0b84a', borderWidth: 1, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 4 },
  buttonText: { color: '#e0b84a', fontSize: 16 },
});
